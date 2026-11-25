import { existsSync } from "node:fs";
import path from "node:path";
import { git, probe, run } from "./exec.mjs";
import { isTestPath } from "./repo.mjs";

export const CATEGORIES = [
  "container",
  "binding",
  "typehint",
  "construction",
  "jsx",
  "static",
  "import",
  "other",
  "test",
];
const TEXT_CAP = 160;
const SOURCE_GLOBS = [
  "*.php",
  "*.ts",
  "*.tsx",
  "*.js",
  "*.jsx",
  "*.mjs",
  "*.cjs",
  "*.mts",
  "*.cts",
];
const DEFINITION_GLOBS = [
  "*.php",
  "*.ts",
  "*.tsx",
  "*.mjs",
  "*.cjs",
  "*.mts",
  "*.cts",
];
const GREP_LINE_RE = /^([^:]+):(\d+):(.*)$/;
// `git grep -z -n` prints each match as path NUL line NUL text LF, with the
// path as git stores it: not quoted, and whole when it holds a colon or a
// newline. `-I` keeps out the "Binary file … matches" lines, which have no NUL.
const GREP_RECORD_RE = /([^\0]*)\0(\d+)\0([^\n]*)\n/g;
// ast-grep matches the AST, so these hits are multi-line-safe and immune to
// comments and strings. One scan per pattern across AST_SCAN_DIRS, filtered per symbol afterwards.
const AST_PATTERNS = [
  ["container", "resolve($C::class)"],
  ["container", "resolve($C::class, $$$)"],
  ["container", "app($C::class)"],
  ["container", "App::make($C::class)"],
  ["container", "App::makeWith($C::class, $$$)"],
  ["container", "$O->make($C::class)"],
  ["container", "$O->makeWith($C::class, $$$)"],
  ["binding", "$O->bind($C::class, $$$)"],
  ["binding", "$O->singleton($C::class)"],
  ["binding", "$O->singleton($C::class, $$$)"],
  ["binding", "$O->scoped($C::class, $$$)"],
  ["binding", "$O->instance($C::class, $$$)"],
];
const AST_SCAN_DIRS = ["app", "config", "routes", "database", "src"];
const astCache = new WeakMap();

// Untruncated: classification needs the whole line, since a type-hint or
// `::class` past the display cap would otherwise land in the wrong bucket.
function splitGrepLine(line) {
  const m = GREP_LINE_RE.exec(line);
  if (!m) return null;
  return { filePath: m[1], lineNo: m[2], text: m[3].trim() };
}

const forDisplay = (hit) => ({ ...hit, text: hit.text.slice(0, TEXT_CAP) });

export function parseGrepLine(line) {
  const hit = splitGrepLine(line);
  return hit && forDisplay(hit);
}

function grepRecords(stdout) {
  return [...stdout.matchAll(GREP_RECORD_RE)].map((m) => ({
    filePath: m[1],
    lineNo: m[2],
    text: m[3].trim(),
  }));
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The characters a name can run on with. git grep's -w knows only ASCII
// letters, digits and `_`, so it matches `user-profile` inside
// `user-profile-card` and `café` inside `caféé`.
const NAME_CHAR = "\\p{L}\\p{M}\\p{N}_$";
const NO_NAME_CHAR_BEFORE = `(?<![${NAME_CHAR}])`;

// A hit counts when some occurrence of the name has no name character before
// it and none after it. After a name taken from a file name, `-` also counts
// as one, so `button` does not list `button-group`; after an exported name
// it does not, so `retries` keeps `retries--`. `.` stays a boundary on both
// sides (`components.user-profile`, `./vite.config`), and so does `-` before
// a name (`<x-user-profile />`).
function boundedName(sym, fromFileName) {
  const after = fromFileName ? `${NAME_CHAR}-` : NAME_CHAR;
  return new RegExp(`${NO_NAME_CHAR_BEFORE}${esc(sym)}(?![${after}])`, "u");
}

const BINDING_CALL_RE = /(->|::)\s*(bind|singleton|scoped|instance)\s*\(/g;

// A container method call with the symbol's ::class among its arguments, so
// JS `.bind(` and `Foo::instance()` stay out of the bindings bucket. The
// arguments are cut at the first `)` before matching, which keeps it linear.
function isBinding(sym, t) {
  const classRef = new RegExp(`(^|[^\\w])${esc(sym)}::class`);
  for (const m of t.matchAll(BINDING_CALL_RE)) {
    const start = m.index + m[0].length;
    const end = t.indexOf(")", start);
    if (classRef.test(t.slice(start, end === -1 ? t.length : end))) return true;
  }
  return false;
}

function phpCategory(sym, t) {
  const s = esc(sym);
  if (isBinding(sym, t)) return "binding";
  if (
    new RegExp(
      `(\\bresolve|\\bapp|(->|::)make(With)?)\\s*\\(\\s*(\\\\?[\\w\\\\]*\\\\)?${s}::class`,
    ).test(t)
  ) {
    return "container";
  }
  if (new RegExp(`\\bnew\\s+(\\\\?[\\w\\\\]*\\\\)?${s}\\s*\\(`).test(t)) {
    return "construction";
  }
  if (new RegExp(`${NO_NAME_CHAR_BEFORE}${s}\\s+\\$\\w+`, "u").test(t)) {
    return "typehint";
  }
  if (/^use\s+[\w\\]+;/.test(t)) return "import";
  if (new RegExp(`${NO_NAME_CHAR_BEFORE}${s}::`, "u").test(t)) return "static";
  return null;
}

export function classifyHit(sym, text) {
  const t = text.trim();
  if (/^import\b/.test(t) || /}\s*from\s+['"]/.test(t)) return "import";
  if (new RegExp(`<${esc(sym)}[\\s/>]`).test(t)) return "jsx";
  return phpCategory(sym, t) ?? "other";
}

// git paths always use "/". With the repo root as target every hit is inside it,
// so only the symbol's own file counts as internal there.
function isInternal(filePath, scope) {
  return filePath === scope || filePath.startsWith(`${scope}/`);
}

export function internalScope(relTarget, ownFile) {
  return relTarget === "." ? ownFile : relTarget;
}

function push(buckets, category, hit) {
  buckets[category] ??= [];
  buckets[category].push(hit);
}

// Structural hits go first: they are AST-precise, so they own their file:line.
function claimAstHits(buckets, sym, relTarget, astHits) {
  const claimed = new Set();
  const classRef = new RegExp(`(^|[^\\w])${esc(sym)}::class`);
  for (const h of astHits ?? []) {
    if (!classRef.test(h.text) || isInternal(h.filePath, relTarget)) continue;
    claimed.add(`${h.filePath}:${h.lineNo}`);
    push(buckets, isTestPath(h.filePath) ? "test" : h.category, forDisplay(h));
  }
  return claimed;
}

export function bucketHits(
  sym,
  relTarget,
  grepStdout,
  astHits,
  fromFileName = false,
) {
  const buckets = {};
  const claimed = claimAstHits(buckets, sym, relTarget, astHits);
  const bounded = boundedName(sym, fromFileName);
  for (const hit of grepRecords(grepStdout)) {
    if (
      isInternal(hit.filePath, relTarget) ||
      claimed.has(`${hit.filePath}:${hit.lineNo}`) ||
      !bounded.test(hit.text)
    ) {
      continue;
    }
    push(
      buckets,
      isTestPath(hit.filePath) ? "test" : classifyHit(sym, hit.text),
      forDisplay(hit),
    );
  }
  return buckets;
}

// ast-grep exits 1 both for "no match" and for an error; only an error writes stderr.
function scanPattern(ctx, scanDirs, category, pattern) {
  const res = run(
    "ast-grep",
    ["--pattern", pattern, "--lang", "php", ...scanDirs],
    { cwd: ctx.repoRoot, timeout: 30_000, env: ctx.env },
  );
  const failure =
    res.error?.message ?? (res.status === 0 ? "" : (res.stderr ?? "").trim());
  if (failure) return { hits: [], error: failure.split("\n")[0] };
  const hits = [];
  for (const line of (res.stdout ?? "").split("\n")) {
    const hit = splitGrepLine(line);
    if (hit) hits.push({ category, ...hit });
  }
  return { hits, error: null };
}

function computeAstScan(ctx) {
  if (!probe("ast-grep", ctx.env)) return { state: "absent", hits: null };
  if (!ctx.files.some((f) => f.endsWith(".php"))) {
    return { state: "not-needed", hits: null };
  }
  const scanDirs = AST_SCAN_DIRS.filter((d) =>
    existsSync(path.join(ctx.repoRoot, d)),
  );
  if (scanDirs.length === 0) return { state: "no-dirs", hits: null };
  const scans = AST_PATTERNS.map(([category, pattern]) =>
    scanPattern(ctx, scanDirs, category, pattern),
  );
  const errors = scans.map((r) => r.error).filter(Boolean);
  if (errors.length === scans.length) {
    return { state: "failed", hits: null, error: errors[0] };
  }
  return { state: "ran", hits: scans.flatMap((r) => r.hits) };
}

/** One ast-grep pass per ctx: the Tools line and every symbol's wiring share it. */
export function astGrepScan(ctx) {
  if (astCache.has(ctx)) return astCache.get(ctx);
  const scan = computeAstScan(ctx);
  astCache.set(ctx, scan);
  return scan;
}

export function wiringFor(ctx, sym, ownFile, fromFileName = false) {
  // git grep: tracked files only, so vendor/ and node_modules/ drop out for free.
  // `-e` marks sym as the pattern, so git never reads it as an option, and `-F`
  // matches it as text: `$` is legal in a JS name and an anchor in a pattern.
  const res = git(
    [
      "grep",
      "-nwF",
      "-I",
      "-z",
      "--no-color",
      "-e",
      sym,
      "--",
      ...SOURCE_GLOBS,
      ":!doc",
      ":!storage",
      ":!dist",
      ":!build",
    ],
    { cwd: ctx.repoRoot, timeout: 20_000, env: ctx.env },
  );
  // git grep exits 1 on "no matches"; only >= 2 is a failure.
  if (res.error || (res.status !== 0 && res.status !== 1)) return null;
  return bucketHits(
    sym,
    internalScope(ctx.relTarget, ownFile),
    res.stdout ?? "",
    astGrepScan(ctx).hits,
    fromFileName,
  );
}

// The wiring scan matches by word, so a same-named class elsewhere makes
// external hits ambiguous. Surface it instead of conflating the two.
export function duplicateDefinitions(ctx, sym, ownFile) {
  const res = git(
    [
      "grep",
      "-nwE",
      "-I",
      "-z",
      "--no-color",
      "-e",
      `(class|interface|trait|enum) ${esc(sym)}`,
      "--",
      ...DEFINITION_GLOBS,
    ],
    { cwd: ctx.repoRoot, timeout: 10_000, env: ctx.env },
  );
  if (res.error || (res.status !== 0 && res.status !== 1)) return [];
  return grepRecords(res.stdout ?? "")
    .filter((hit) => hit.filePath !== ownFile)
    .map((hit) => `${hit.filePath}:${hit.lineNo}`);
}
