import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { git, run, withoutPathspecVars } from "./exec.mjs";

const CODEGRAPH_CAP = 80;
const INDEX_DIR = ".codegraph";
const INDEX_IGNORE_FILE = `${INDEX_DIR}/.gitignore`;
const INDEX_DB = "codegraph.db";

const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const objects = (v) => (Array.isArray(v) ? v.filter(isObject) : []);

// Only `status` is guaranteed; every other field is shaped here so one
// malformed symbol cannot throw while the brief renders.
function toGraphContext(parsed) {
  const incoming = isObject(parsed.incoming) ? parsed.incoming : {};
  return {
    ...parsed,
    symbol: isObject(parsed.symbol) ? parsed.symbol : null,
    boundaries: Array.isArray(parsed.boundaries)
      ? parsed.boundaries.filter((b) => typeof b === "string")
      : [],
    incoming: {
      calls: objects(incoming.calls),
      imports: objects(incoming.imports),
    },
    processes: Array.isArray(parsed.processes)
      ? parsed.processes.filter((p) => typeof p === "string" || isObject(p))
      : [],
    epistemic: typeof parsed.epistemic === "string" ? parsed.epistemic : "",
  };
}

export function parseGraphContext(stdout) {
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    return isObject(parsed) && parsed.status === "found"
      ? toGraphContext(parsed)
      : null;
  } catch {
    return null;
  }
}

export function graphContext(ctx, symbolName) {
  // By path: a linked worktree's registry name is not its directory name,
  // and a name two checkouts share is ambiguous to gitnexus. The name goes
  // after `--`, so gitnexus never reads it as an option.
  const res = run(
    "gitnexus",
    ["context", "--repo", ctx.repoRoot, "--", symbolName],
    { cwd: ctx.repoRoot, env: ctx.env, timeout: 10_000 },
  );
  if (res.error || res.status !== 0) return null;
  return parseGraphContext(res.stdout);
}

function hasIndexDb(dir) {
  try {
    return statSync(path.join(dir, INDEX_DIR, INDEX_DB)).isFile();
  } catch {
    return false;
  }
}

// The directory codegraph reads from when the repository has no database of
// its own: like codegraph, the nearest one above that holds
// `.codegraph/codegraph.db`, up to the filesystem root.
function indexAbove(dir) {
  let current = dir;
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
    if (hasIndexDb(current)) return current;
  }
}

// git tracks anything under `.codegraph` but the `.gitignore` codegraph
// writes there, so the repository supplies its own index; or null when git
// cannot say.
function tracksIndex(ctx) {
  // icase: on a filesystem that folds case, `.CodeGraph` is the same folder.
  const res = git(["ls-files", "-z", "--", `:(icase,literal)${INDEX_DIR}`], {
    cwd: ctx.repoRoot,
    env: withoutPathspecVars(ctx.env),
  });
  if (res.error || res.status !== 0) return null;

  return res.stdout
    .split("\0")
    .filter(Boolean)
    .some((entry) => entry.toLowerCase() !== INDEX_IGNORE_FILE);
}

/**
 * The codegraph index the brief may read. `state` is "tracked" when the
 * repository tracks its own index, "unknown" when git cannot say, "present"
 * with the `root` codegraph will read (the repository, or a directory above
 * it), or "absent".
 */
export function codegraphIndex(ctx) {
  if (existsSync(path.join(ctx.repoRoot, INDEX_DIR))) {
    const tracked = tracksIndex(ctx);
    if (tracked === null) return { state: "unknown" };
    if (tracked) return { state: "tracked" };
    if (hasIndexDb(ctx.repoRoot)) {
      return { state: "present", root: ctx.repoRoot };
    }
  }
  const above = indexAbove(ctx.repoRoot);

  return above ? { state: "present", root: above } : { state: "absent" };
}

export function codegraphOverview(ctx, symNames) {
  // The names go after `--`, so codegraph never reads one as an option.
  const res = run(
    "codegraph",
    [
      "explore",
      "--max-files",
      "0",
      "--no-color",
      "--",
      ...symNames,
      "callers and relationships",
    ],
    { cwd: ctx.repoRoot, env: ctx.env, timeout: 20_000 },
  );
  if (res.error || res.status !== 0 || !res.stdout) return null;
  const lines = res.stdout.split("\n");
  if (lines.length <= CODEGRAPH_CAP) return lines;
  return [
    ...lines.slice(0, CODEGRAPH_CAP),
    `… truncated (${lines.length - CODEGRAPH_CAP} more lines; run codegraph explore for full output)`,
  ];
}
