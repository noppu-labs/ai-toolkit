import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { run } from "./exec.mjs";

export const SOURCE_EXT = new Set([".php", ".ts", ".tsx", ".js", ".jsx"]);
export const GENERIC_NAMES =
  /^(index|types|schemas|utils|helpers|config|constants)$/i;
export const TEST_PATH_RE = /(^|\/)(tests?|__tests__|__mocks__)\//;
export const TS_EXT_RE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE_RE = /\.(test|spec|stories)\.[jt]sx?$/;
const MIN_NAME_LENGTH = 4;
const EXPORT_RE =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\s*\*?|class|const\s+enum|const|let|var|enum|type|interface|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;

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

function walk(dir, root, acc) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "vendor" ||
      entry.name === "node_modules" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (statSync(full).isDirectory()) walk(full, root, acc);
    else if (isSourceFile(path.relative(root, full))) acc.push(full);
  }
  return acc;
}

export function collectFiles(p) {
  // Filters see paths relative to the target so an ancestor named `tests` cannot hide the repo.
  if (statSync(p).isFile()) return isSourceFile(path.basename(p)) ? [p] : [];
  return walk(p, p, []).sort();
}

export function tsExports(text) {
  const names = [];
  for (const m of text.matchAll(EXPORT_RE)) {
    if (m[1] && !names.includes(m[1])) names.push(m[1]);
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

function symbolsOf(file, repoRoot) {
  const rel = path.relative(repoRoot, file);
  if (file.endsWith(".php")) {
    const name = path.basename(file, ".php").replace(/\.blade$/, "");
    return [{ name, file: rel, kind: "php" }];
  }
  return tsExports(readFileSync(file, "utf8")).map((name) => ({
    name,
    file: rel,
    kind: "ts",
  }));
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
