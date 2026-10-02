import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { run } from "./exec.mjs";

export const SOURCE_EXT = new Set([
  ".php",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
export const GENERIC_NAMES =
  /^(index|types|schemas|utils|helpers|config|constants)$/i;
export const TEST_PATH_RE = /(^|\/)(tests?|__tests__|__mocks__)\//;
export const TS_EXT_RE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const TEST_FILE_RE = /\.(test|spec|stories)\.(?:[cm]?[jt]s|[jt]sx)$/;
const MIN_NAME_LENGTH = 4;
const IDENT_RE = /^[A-Za-z_$][\w$]*$/;
const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|class|const\s+enum|const|let|var|enum|type|interface|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;
// `export { a, b as c }` names a and c; a list followed by `from` re-exports
// another module's symbols, which are not defined here.
const EXPORT_LIST_RE = /^\s*export\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/gm;
const DEFAULT_IDENT_RE = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/gm;
const CJS_DEFAULT_RE =
  /^\s*module\.exports\s*=\s*([A-Za-z_$][\w$]*)\s*;?\s*$/gm;
const CJS_NAMED_RE = /^\s*(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm;
const SKIPPED_DIRS = new Set(["vendor", "node_modules"]);

export function resolveRepo(targetArg, env = process.env) {
  const resolved = path.resolve(targetArg);
  if (!existsSync(resolved))
    throw new Error(`target does not exist: ${resolved}`);
  // realpath: macOS tmpdir is a symlink and `git rev-parse` returns the real path,
  // so a relative() between the two forms would climb out of the repo.
  const target = realpathSync(resolved);
  const cwd = statSync(target).isDirectory() ? target : path.dirname(target);
  const gitRoot = run("git", ["rev-parse", "--show-toplevel"], { cwd, env });
  if (gitRoot.status !== 0)
    throw new Error("target is not inside a git repository");
  const repoRoot = gitRoot.stdout.trim();
  return {
    target,
    repoRoot,
    repoName: path.basename(repoRoot),
    relTarget: path.relative(repoRoot, target) || ".",
  };
}

function isSourceFile(rel) {
  return (
    SOURCE_EXT.has(path.extname(rel)) &&
    !TEST_PATH_RE.test(rel) &&
    !TEST_FILE_RE.test(rel)
  );
}

function inSkippedDir(rel) {
  return rel
    .split("/")
    .slice(0, -1)
    .some((seg) => SKIPPED_DIRS.has(seg) || seg.startsWith("."));
}

// lstat, not stat: a symlink is skipped rather than followed, so a dangling
// link or a link to an ancestor cannot abort or loop the walk.
function isRegularFile(full) {
  try {
    return lstatSync(full).isFile();
  } catch {
    return false;
  }
}

function keep(rel, full) {
  return (
    !inSkippedDir(rel) &&
    !path.basename(rel).startsWith(".") &&
    isSourceFile(rel) &&
    isRegularFile(full)
  );
}

// git ls-files, like the wiring scan's git grep: gitignored and generated
// sources stay out. Untracked files that are not ignored are still listed.
function listDir(dir, env) {
  const res = run(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: dir, env },
  );
  if (res.error || res.status !== 0) {
    throw new Error(
      `git ls-files failed in ${dir}: ${(res.stderr || res.error?.message || "").trim()}`,
    );
  }
  return res.stdout.split("\0").filter(Boolean);
}

export function collectFiles(p, env = process.env) {
  // Filters see paths relative to the target so an ancestor named `tests` cannot hide the repo.
  if (statSync(p).isFile()) return isSourceFile(path.basename(p)) ? [p] : [];
  const files = listDir(p, env)
    .map((rel) => ({ rel, full: path.join(p, rel) }))
    .filter(({ rel, full }) => keep(rel, full))
    .map(({ full }) => full);
  return [...new Set(files)].sort();
}

function listNames(body) {
  return body
    .split(",")
    .map((item) =>
      item
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .at(-1),
    )
    .filter((name) => name && name !== "default" && IDENT_RE.test(name));
}

function exportMatches(text) {
  const hits = [];
  for (const re of [
    EXPORT_RE,
    DEFAULT_IDENT_RE,
    CJS_DEFAULT_RE,
    CJS_NAMED_RE,
  ]) {
    for (const m of text.matchAll(re))
      hits.push({ at: m.index, names: [m[1]] });
  }
  for (const m of text.matchAll(EXPORT_LIST_RE)) {
    hits.push({ at: m.index, names: listNames(m[1]) });
  }
  return hits.sort((a, b) => a.at - b.at).flatMap((h) => h.names);
}

export function tsExports(text) {
  const names = [];
  for (const name of exportMatches(text)) {
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function usable(name, seen) {
  return (
    name.length >= MIN_NAME_LENGTH &&
    !GENERIC_NAMES.test(name) &&
    !seen.has(name)
  );
}

function basenameOf(file) {
  return path.basename(file, path.extname(file)).replace(/\.blade$/, "");
}

function symbolsOf(file, repoRoot) {
  const rel = path.relative(repoRoot, file);
  if (file.endsWith(".php")) {
    return [{ name: basenameOf(file), file: rel, kind: "php" }];
  }
  const names = tsExports(readFileSync(file, "utf8"));
  if (names.length === 0) {
    // Same as the MVP: a file that exports nothing by name still gets its basename.
    return [
      { name: basenameOf(file), file: rel, kind: "ts", basenameFallback: true },
    ];
  }
  return names.map((name) => ({ name, file: rel, kind: "ts" }));
}

export function deriveSymbols(files, repoRoot, maxSymbols) {
  const seen = new Set();
  const all = [];
  for (const file of files) {
    for (const sym of symbolsOf(file, repoRoot)) {
      if (!usable(sym.name, seen)) continue;
      seen.add(sym.name);
      all.push(sym);
    }
  }
  return {
    symbols: all.slice(0, maxSymbols),
    truncated: all.length > maxSymbols,
  };
}
