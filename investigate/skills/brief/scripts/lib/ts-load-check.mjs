import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { git, withoutPathspecVars } from "./exec.mjs";
import { workingTreeRoot } from "./repo.mjs";
import { refusesPluginPaths, serverTypeScript } from "./ts-version.mjs";

export const TRUST_VAR = "INVESTIGATE_BRIEF_TRUST_REPO_TS";

// Where typescript-language-server 5.x looks for a TypeScript, and where that
// TypeScript loads code from: the folder holding it (and the plugins a
// tsconfig names), the editor SDKs, and what a Yarn SDK loads. The server
// looks in the workspace root and in every directory above it.
export const LOAD_LOCATIONS = [
  "node_modules",
  ".yarn/sdks",
  ".vscode/pnpify",
  ".pnp.cjs",
  ".pnp.js",
  ".pnp.loader.mjs",
  ".pnp.data.json",
  ".yarn/cache",
  ".yarn/unplugged",
];

const REASON_CAP = 240;

const toPosix = (rel) => rel.split(path.sep).join("/");

// A link or a submodule can be an index entry; a plain directory cannot.
function mayBeEntry(full) {
  try {
    return (
      !lstatSync(full).isDirectory() || existsSync(path.join(full, ".git"))
    );
  } catch {
    return false;
  }
}

// Parent components of `rel` worth asking git about as entries of their own.
function entryParents(root, rel) {
  const parts = rel.split("/");
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(0, i).join("/");
    if (mayBeEntry(path.join(root, parent))) out.push(parent);
  }
  return out;
}

/**
 * The first of `rels` (paths relative to `root`, with /) that git tracks a
 * file at or below, or under a tracked link or submodule. Throws when git
 * cannot answer, so the caller fails closed.
 */
function firstTracked(root, rels, env) {
  const asked = new Set(rels.flatMap((r) => [r, ...entryParents(root, r)]));
  const res = git(
    ["ls-files", "-z", "--", ...[...asked].map((r) => `:(icase,literal)${r}`)],
    { cwd: root, env: withoutPathspecVars(env) },
  );
  if (res.error || res.status !== 0) {
    throw new Error(
      `git ls-files failed: ${(res.stderr || res.error?.message || "").trim()}`,
    );
  }
  const entries = res.stdout
    .split("\0")
    .filter(Boolean)
    .map((e) => e.toLowerCase());

  return rels.find((rel) => {
    const r = rel.toLowerCase();
    return entries.some(
      (e) => e === r || e.startsWith(`${r}/`) || r.startsWith(`${e}/`),
    );
  });
}

const isGitDirShape = (dir) =>
  ["HEAD", "objects", "refs"].every((part) => existsSync(path.join(dir, part)));

// True when `dir` or a directory above it holds a repository on disk.
function underRepository(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (existsSync(path.join(d, ".git")) || isGitDirShape(d)) return true;
    if (path.dirname(d) === d) return false;
  }
}

// The working tree holding `full`, or null when no repository holds it. A git
// that refuses to answer where the disk shows a repository (a folder shaped
// like a git directory, for one) is an error, so the check fails closed.
function treeHolding(full, env) {
  const dir = statSync(full).isDirectory() ? full : path.dirname(full);
  const root = workingTreeRoot(dir, env);
  if (root === null && underRepository(dir)) {
    throw new Error(
      "git would not name the working tree around a folder the server loads code from",
    );
  }

  return root;
}

// The locations present in `dir` that a working tree tracks, through their
// spelling in the tree holding `dir` or their real location.
function trackedIn(dir, root, present, env) {
  const tree = root ?? treeHolding(dir, env);
  const spelled =
    tree === null
      ? undefined
      : firstTracked(
          tree,
          present.map((loc) =>
            toPosix(path.relative(tree, path.join(dir, loc))),
          ),
          env,
        );
  if (spelled !== undefined) {
    return present.find(
      (loc) => toPosix(path.relative(tree, path.join(dir, loc))) === spelled,
    );
  }
  return present.find((loc) => {
    const full = path.join(dir, loc);
    const real = realpathSync.native(full);
    if (tree !== null && real === full) return false;
    const realTree = treeHolding(real, env);
    if (realTree === null) return false;
    return (
      firstTracked(realTree, [toPosix(path.relative(realTree, real))], env) !==
      undefined
    );
  });
}

function ancestorsOf(dir) {
  const out = [];
  for (
    let d = dir, up = path.dirname(d);
    up !== d;
    d = up, up = path.dirname(d)
  ) {
    out.push(up);
  }
  return out;
}

const oneLine = (text, cap) => String(text).replace(/\s+/g, " ").slice(0, cap);

// Why the repository, or a working tree around it, makes the server load
// code it tracks; null when it does not.
function trackedReason(ctx) {
  for (const dir of [ctx.repoRoot, ...ancestorsOf(ctx.repoRoot)]) {
    const present = LOAD_LOCATIONS.filter((loc) =>
      existsSync(path.join(dir, loc)),
    );
    if (present.length === 0) continue;
    const inRepo = dir === ctx.repoRoot;
    const hit = trackedIn(dir, inRepo ? ctx.repoRoot : null, present, ctx.env);
    if (hit !== undefined) {
      const who = inRepo
        ? "the repository"
        : "a working tree above the repository";
      return `${who} tracks files in ${hit}, where the server loads code from`;
    }
  }

  return null;
}

function oldTsReason(ctx, cmd) {
  const ts = serverTypeScript(ctx.repoRoot, cmd, ctx.env);
  if (ts === null || refusesPluginPaths(ts.version)) return null;

  return `the TypeScript the server would run (${oneLine(ts.version, 40)}, ${ts.where}) loads a plugin from any path a tsconfig names`;
}

/**
 * Why the TypeScript pass must not start in this repository, or null when it
 * may. It may when no working tree tracks a file where the server (`cmd`) or
 * the TypeScript it starts loads code from, and that TypeScript refuses plugin
 * names that are paths; or when the user trusts the repository.
 */
export function tsLoadSkipReason(ctx, cmd) {
  if (ctx.env[TRUST_VAR] === "1") return null;
  const optIn = `set ${TRUST_VAR}=1 to run it`;
  try {
    const reason = trackedReason(ctx) ?? oldTsReason(ctx, cmd);
    return reason === null ? null : `${reason}; ${optIn}`;
  } catch (e) {
    const why = oneLine(e?.message ?? e, REASON_CAP);
    return `could not tell whether the repository tracks code the server loads (${why}); ${optIn}`;
  }
}
