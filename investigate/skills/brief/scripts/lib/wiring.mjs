import { existsSync } from "node:fs";
import path from "node:path";
import { probe, run } from "./exec.mjs";
import { TEST_PATH_RE } from "./repo.mjs";

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
const GREP_LINE_RE = /^([^:]+):(\d+):(.*)$/;
// ast-grep matches the AST, so these hits are multi-line-safe and immune to
// comments and strings. One scan per pattern for the whole repo, filtered per symbol afterwards.
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

export function parseGrepLine(line) {
  const m = GREP_LINE_RE.exec(line);
  if (!m) return null;
  return {
    filePath: m[1],
    lineNo: m[2],
    text: m[3].trim().slice(0, TEXT_CAP),
  };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function phpCategory(sym, t) {
  const s = esc(sym);
  if (/\b(bind|singleton|scoped|instance)\s*\(/.test(t)) return "binding";
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
  if (new RegExp(`\\b${s}\\s+\\$\\w+`).test(t)) return "typehint";
  if (/^use\s+[\w\\]+;/.test(t)) return "import";
  if (new RegExp(`\\b${s}::`).test(t)) return "static";
  return null;
}

export function classifyHit(sym, text) {
  const t = text.trim();
  if (/^import\b/.test(t) || /}\s*from\s+['"]/.test(t)) return "import";
  if (new RegExp(`<${esc(sym)}[\\s/>]`).test(t)) return "jsx";
  return phpCategory(sym, t) ?? "other";
}

function isInternal(filePath, relTarget) {
  return (
    filePath === relTarget || filePath.startsWith(`${relTarget}${path.sep}`)
  );
}

function push(buckets, category, hit) {
  buckets[category] ??= [];
  buckets[category].push(hit);
}

// Structural hits go first: they are AST-precise, so they own their file:line.
function claimAstHits(buckets, sym, relTarget, astHits) {
  const claimed = new Set();
  for (const h of astHits ?? []) {
    if (!h.text.includes(`${sym}::class`) || isInternal(h.filePath, relTarget))
      continue;
    claimed.add(`${h.filePath}:${h.lineNo}`);
    push(buckets, TEST_PATH_RE.test(h.filePath) ? "test" : h.category, h);
  }
  return claimed;
}

export function bucketHits(sym, relTarget, grepStdout, astHits) {
  const buckets = {};
  const claimed = claimAstHits(buckets, sym, relTarget, astHits);
  for (const line of grepStdout.split("\n")) {
    const hit = parseGrepLine(line);
    if (
      !hit ||
      isInternal(hit.filePath, relTarget) ||
      claimed.has(`${hit.filePath}:${hit.lineNo}`)
    ) {
      continue;
    }
    push(
      buckets,
      TEST_PATH_RE.test(hit.filePath) ? "test" : classifyHit(sym, hit.text),
      hit,
    );
  }
  return buckets;
}

function scanPattern(ctx, scanDirs, category, pattern) {
  const res = run(
    "ast-grep",
    ["--pattern", pattern, "--lang", "php", ...scanDirs],
    { cwd: ctx.repoRoot, timeout: 30_000, env: ctx.env },
  );
  if (res.error || !res.stdout) return [];
  const hits = [];
  for (const line of res.stdout.split("\n")) {
    const hit = parseGrepLine(line);
    if (hit) hits.push({ category, ...hit });
  }
  return hits;
}

function computeAstHits(ctx) {
  if (!probe("ast-grep", ctx.env)) return null;
  const scanDirs = AST_SCAN_DIRS.filter((d) =>
    existsSync(path.join(ctx.repoRoot, d)),
  );
  if (scanDirs.length === 0) return null;
  return AST_PATTERNS.flatMap(([category, pattern]) =>
    scanPattern(ctx, scanDirs, category, pattern),
  );
}

export function astGrepHits(ctx) {
  if (astCache.has(ctx)) return astCache.get(ctx);
  const hits = computeAstHits(ctx);
  astCache.set(ctx, hits);
  return hits;
}

export function wiringFor(ctx, sym) {
  // git grep: tracked files only, so vendor/ and node_modules/ drop out for free.
  const res = run(
    "git",
    [
      "grep",
      "-nw",
      "--no-color",
      sym,
      "--",
      "*.php",
      "*.ts",
      "*.tsx",
      "*.js",
      "*.jsx",
      ":!doc",
      ":!storage",
      ":!dist",
      ":!build",
    ],
    { cwd: ctx.repoRoot, timeout: 20_000, env: ctx.env },
  );
  // git grep exits 1 on "no matches"; only >= 2 is a failure.
  if (res.error || (res.status !== 0 && res.status !== 1)) return null;
  return bucketHits(sym, ctx.relTarget, res.stdout ?? "", astGrepHits(ctx));
}

// The wiring scan matches by word, so a same-named class elsewhere makes
// external hits ambiguous. Surface it instead of conflating the two.
export function duplicateDefinitions(ctx, sym, ownFile) {
  const res = run(
    "git",
    [
      "grep",
      "-nwE",
      `(class|interface|trait|enum) ${sym}`,
      "--",
      "*.php",
      "*.ts",
      "*.tsx",
    ],
    { cwd: ctx.repoRoot, timeout: 10_000, env: ctx.env },
  );
  if (res.error || (res.status !== 0 && res.status !== 1)) return [];
  return (res.stdout ?? "")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(":").slice(0, 2).join(":"))
    .filter((loc) => !loc.startsWith(`${ownFile}:`));
}
