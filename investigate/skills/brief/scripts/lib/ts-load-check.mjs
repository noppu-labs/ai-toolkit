import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { git, withoutPathspecVars } from "./exec.mjs";
import { isOutside, workingTreeRoot } from "./repo.mjs";
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

// Yarn loads packages from its cache and unplugged folders only through a
// Plug'n'Play file beside them. With the node-modules linker there is none.
const PNP_ONLY = new Set([".yarn/cache", ".yarn/unplugged"]);
const PNP_FILES = [".pnp.cjs", ".pnp.js"];

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
 * The name `parent` stores for the entry `name` reaches. On a filesystem that
 * folds letters, `.vscode` can reach an entry stored as `.vſcode`, which
 * neither git's icase nor toLowerCase folds back; the stored entry is the one
 * with the same device and inode, by lstat so a link is not followed. Throws
 * when none matches, so the caller fails closed.
 */
export function storedName(
  parent,
  name,
  { readdirSync: readdir = readdirSync, lstatSync: lstat = lstatSync } = {},
) {
  const names = readdir(parent);
  if (names.includes(name)) return name;
  const want = lstat(path.join(parent, name), { bigint: true });
  const found = names.find((n) => {
    const st = lstat(path.join(parent, n), { bigint: true });
    return st.dev === want.dev && st.ino === want.ino;
  });
  if (found === undefined || want.ino === 0n) {
    throw new Error(`could not find how ${name} is stored in ${parent}`);
  }

  return found;
}

// `rel` (below `dir`, with /) as the directories store each component.
function storedPath(dir, rel) {
  const out = [];
  let parent = dir;
  for (const part of rel.split("/")) {
    const stored = storedName(parent, part);
    out.push(stored);
    parent = path.join(parent, stored);
  }

  return out.join("/");
}

const coversPath = (entry, rel) =>
  entry === rel || entry.startsWith(`${rel}/`) || rel.startsWith(`${entry}/`);

/**
 * The index of the first of `rels` that git tracks a file at or below, or
 * under a tracked link or submodule, or -1. Each holds two paths relative to
 * `root`, with /: `spelled`, asked without regard to letter case, and
 * `stored`, the spelling on disk, asked as it is. Both are needed: a clone
 * can write a tracked `.yarn/sdks` into a folder stored as `.YARN`. Throws
 * when git cannot answer, so the caller fails closed.
 */
function firstTracked(root, rels, env) {
  const asked = new Set();
  for (const { spelled, stored } of rels) {
    for (const r of [spelled, ...entryParents(root, spelled)]) {
      asked.add(`:(icase,literal)${r}`);
    }
    for (const r of [stored, ...entryParents(root, stored)]) {
      asked.add(`:(literal)${r}`);
    }
  }
  const res = git(["ls-files", "-z", "--", ...asked], {
    cwd: root,
    env: withoutPathspecVars(env),
  });
  if (res.error || res.status !== 0) {
    throw new Error(
      `git ls-files failed: ${(res.stderr || res.error?.message || "").trim()}`,
    );
  }
  const entries = res.stdout.split("\0").filter(Boolean);

  return rels.findIndex(({ spelled, stored }) =>
    entries.some(
      (e) =>
        coversPath(e.toLowerCase(), spelled.toLowerCase()) ||
        coversPath(e, stored),
    ),
  );
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

// The location present in `dir` that a working tree tracks, through its
// spelling in `tree` (the tree holding `dir`, or null) or its real location.
function trackedIn(dir, tree, present, env) {
  if (tree !== null) {
    const rels = present.map((loc) => ({
      spelled: toPosix(path.relative(tree, path.join(dir, loc))),
      stored: toPosix(
        path.relative(tree, path.join(dir, storedPath(dir, loc))),
      ),
    }));
    const i = firstTracked(tree, rels, env);
    if (i !== -1) return present[i];
  }
  return present.find((loc) => {
    const full = path.join(dir, loc);
    const real = realpathSync.native(full);
    if (tree !== null && real === full) return false;
    const realTree = treeHolding(real, env);
    if (realTree === null) return false;
    const rel = toPosix(path.relative(realTree, real));
    return firstTracked(realTree, [{ spelled: rel, stored: rel }], env) !== -1;
  });
}

function holdsGitEntry(dir) {
  try {
    lstatSync(path.join(dir, ".git"));
    return true;
  } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return false;
    throw e;
  }
}

function isRealDir(full) {
  try {
    return lstatSync(full).isDirectory();
  } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return false;
    throw e;
  }
}

// The folders inside `full` down to the package the server loads,
// `typescript` and then `typescript/lib`, that hold a `.git` entry. It stops
// at the first one that is missing or is not a real directory, so a linked
// `node_modules/typescript` (an `npm link`) is never descended.
function nestedBelow(full) {
  let current = full;
  for (const part of ["typescript", "lib"]) {
    current = path.join(current, part);
    if (!isRealDir(current)) return null;
    if (holdsGitEntry(current)) return current;
  }

  return null;
}

// A location present in `dir` inside a nested repository: the location, a
// folder between it and `tree` (or `dir`, when no tree holds it), or the
// TypeScript package inside it holds a `.git` entry. git does not answer for
// files in another repository, so a folder a removed submodule or a separate
// clone left there can supply code whatever the outer index says. Returns
// [nested folder, location] or null.
function nestedIn(dir, tree, present) {
  const stop = tree ?? dir;
  for (const loc of present) {
    let current = path.join(dir, loc);
    while (current !== stop && !isOutside(stop, current)) {
      if (holdsGitEntry(current)) return [current, loc];
      current = path.dirname(current);
    }
    const below = nestedBelow(path.join(dir, loc));
    if (below !== null) return [below, loc];
  }

  return null;
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

// Why the load locations in `dir`, the repository or a directory above it,
// make the server load code a repository supplies; null when they do not.
function reasonAt(ctx, dir) {
  const hasPnp = PNP_FILES.some((f) => existsSync(path.join(dir, f)));
  const present = LOAD_LOCATIONS.filter(
    (loc) => (hasPnp || !PNP_ONLY.has(loc)) && existsSync(path.join(dir, loc)),
  );
  if (present.length === 0) return null;
  const inRepo = dir === ctx.repoRoot;
  const tree = inRepo ? ctx.repoRoot : treeHolding(dir, ctx.env);
  const hit = trackedIn(dir, tree, present, ctx.env);
  if (hit !== undefined) {
    const who = inRepo
      ? "the repository"
      : "a working tree above the repository";
    return `${who} tracks files in ${hit}, where the server loads code from`;
  }
  const nested = nestedIn(dir, tree, present);
  if (nested === null) return null;
  const at = inRepo ? toPosix(path.relative(dir, nested[0])) : nested[0];

  return `a nested repository at ${at} holds ${nested[1]}, where the server loads code from`;
}

// Why the repository, or a working tree around it, makes the server load
// code it tracks; null when it does not.
function trackedReason(ctx) {
  for (const dir of [ctx.repoRoot, ...ancestorsOf(ctx.repoRoot)]) {
    const reason = reasonAt(ctx, dir);
    if (reason !== null) return reason;
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
