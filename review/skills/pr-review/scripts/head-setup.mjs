#!/usr/bin/env node

// Set up and undo the checkout a PR review reads its head from. One JSON object
// on stdout; exit 0 on success, 1 when it refuses or fails with
// { "ok": false, "reason": "...", "detail": "..." }.
//
// Usage (run anywhere inside the working tree):
//   node head-setup.mjs plan <head-sha>...
//   node head-setup.mjs enter checkout|worktree|clone <head-sha>
//   node head-setup.mjs restore
//   node head-setup.mjs forget
//
// It never installs anything and never runs a file from the tree. Every git
// call is an argument array to the absolute git path; calls that change a
// working tree also disable hooks and submodule recursion. What `restore` needs
// is recorded in the per-worktree git directory before anything changes.

import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { findExecutable } from "./lib/exec.mjs";
import { makeGit } from "./lib/git.mjs";
import { recognisedLockfile } from "./lib/lockfiles.mjs";
import { dirOf } from "./lib/paths.mjs";
import { compare, sortBy } from "./lib/sort.mjs";
import { listTree, makeSource } from "./lib/tree.mjs";

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const RECORD_FILE = "pr-review-setup.json";
const MARKER_FILE = ".pr-review-marker";
const SCRATCH_PREFIX = "pr-review-";
const HEAD_DIR = "head";
const KINDS = ["checkout", "worktree", "clone"];
const UNSAFE_BRANCH_CHARS = " ~^:?*[\\";
const SAFE_GIT = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "submodule.recurse=false",
];
const OPERATION_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "rebase-merge",
  "rebase-apply",
  "BISECT_LOG",
];
const DEPENDENCY_NAMES = new Map([
  ["composer", ["vendor"]],
  ["npm", ["node_modules"]],
  ["pnpm", ["node_modules"]],
  ["bun", ["node_modules"]],
  ["yarn", ["node_modules", ".pnp.cjs"]],
  ["uv", [".venv"]],
  ["poetry", [".venv"]],
]);

class Refusal extends Error {
  constructor(reason, detail, extra = {}) {
    super(detail);
    this.reason = reason;
    this.extra = extra;
  }
}

function refuse(reason, detail, extra) {
  throw new Refusal(reason, detail, extra);
}

function makeContext() {
  const gitPath = findExecutable("git");

  if (gitPath === null) {
    refuse("no-git", "git not found on PATH");
  }

  const probe = makeGit(gitPath, process.cwd()).run([
    "rev-parse",
    "--show-toplevel",
  ]);

  if (probe.status !== 0) {
    refuse("not-a-repository", probe.stderr.trim());
  }

  const top = probe.stdout.trim();
  const git = makeGit(gitPath, top);
  const gitDir = git.text(["rev-parse", "--absolute-git-dir"]).trim();

  return { gitPath, git, top, gitDir };
}

function quoteShell(word) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(word)) {
    return word;
  }

  return `'${word.replaceAll("'", "'\\''")}'`;
}

function isValidBranch(name) {
  return (
    typeof name === "string" &&
    name !== "" &&
    !name.startsWith("-") &&
    [...name].every(
      (char) =>
        char.charCodeAt(0) > 32 &&
        char.charCodeAt(0) !== 127 &&
        !UNSAFE_BRANCH_CHARS.includes(char),
    )
  );
}

function isInside(root, path) {
  const offset = relative(root, path);

  return offset !== "" && !offset.startsWith("..") && !isAbsolute(offset);
}

function currentHead(ctx) {
  const result = ctx.git.run(["rev-parse", "--verify", "--quiet", "HEAD"]);

  if (result.status !== 0 || !SHA.test(result.stdout.trim())) {
    refuse("no-commit", "the working tree has no commit yet");
  }

  return result.stdout.trim();
}

function currentBranch(ctx) {
  const result = ctx.git.run(["symbolic-ref", "--quiet", "HEAD"]);

  return result.status === 0
    ? result.stdout.trim().replace(/^refs\/heads\//, "")
    : null;
}

function requireCommit(ctx, sha) {
  if (!SHA.test(sha ?? "")) {
    refuse("bad-sha", `expected a 40-character commit sha, got ${sha}`);
  }

  const result = ctx.git.run([
    "rev-parse",
    "--verify",
    "--quiet",
    `${sha}^{commit}`,
  ]);

  if (result.status !== 0) {
    refuse("bad-sha", `${sha} is not a commit in this repository`);
  }
}

function statusPaths(ctx, ignoreSubmodules) {
  const args = ["status", "--porcelain", "-z", "--no-renames"];

  if (ignoreSubmodules) {
    args.push("--ignore-submodules=all");
  }

  return ctx.git
    .text(args)
    .split("\0")
    .filter((record) => record !== "")
    .map((record) => record.slice(3));
}

function operationInProgress(ctx) {
  return OPERATION_MARKERS.find((name) => existsSync(join(ctx.gitDir, name)));
}

function describeProblem(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return "an entry is not an object";
  }

  if (typeof entry.id !== "string" || !UUID.test(entry.id)) {
    return "an entry has no valid id";
  }

  if (!KINDS.includes(entry.kind)) {
    return `entry ${entry.id} has an unknown kind`;
  }

  if (!SHA.test(entry.headSha)) {
    return `entry ${entry.id} has no valid head sha`;
  }

  return entry.kind === "checkout"
    ? describeCheckoutProblem(entry)
    : describeScratchProblem(entry);
}

function describeCheckoutProblem(entry) {
  if (!SHA.test(entry.fromSha)) {
    return `entry ${entry.id} has no valid sha to return to`;
  }

  if (entry.branch !== null && !isValidBranch(entry.branch)) {
    return `entry ${entry.id} has an unusable branch name`;
  }

  return null;
}

function describeScratchProblem(entry) {
  const paths = [entry.path, entry.parent];

  if (!paths.every((path) => typeof path === "string" && isAbsolute(path))) {
    return `entry ${entry.id} has a path that is not absolute`;
  }

  if (
    entry.path !== join(entry.parent, HEAD_DIR) ||
    !basename(entry.parent).startsWith(SCRATCH_PREFIX)
  ) {
    return `entry ${entry.id} has a path outside a ${SCRATCH_PREFIX}* directory`;
  }

  return null;
}

function parseRecord(text) {
  let value = null;

  try {
    value = JSON.parse(text);
  } catch {
    return { problem: "the record is not valid JSON" };
  }

  if (value === null || typeof value !== "object" || value.version !== 1) {
    return { problem: "the record has another version" };
  }

  if (!Array.isArray(value.entries)) {
    return { problem: "the record has no entries list" };
  }

  const problem = value.entries.map(describeProblem).find((found) => found);

  return problem === undefined ? { entries: value.entries } : { problem };
}

// { entries } for a usable record, { entries: [] } for none, { problem }
// when it exists but cannot be trusted.
function loadRecord(ctx) {
  const file = join(ctx.gitDir, RECORD_FILE);

  if (!existsSync(file) && !isLink(file)) {
    return { entries: [] };
  }

  if (isLink(file)) {
    return { problem: "the record is a symlink" };
  }

  try {
    return parseRecord(readFileSync(file, "utf8"));
  } catch (error) {
    return { problem: `the record cannot be read: ${error.message}` };
  }
}

function isLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function requireRecord(ctx) {
  const loaded = loadRecord(ctx);

  if (loaded.problem !== undefined) {
    refuse(
      "record-unreadable",
      `${loaded.problem}; run \`head-setup.mjs forget\` to clear it`,
    );
  }

  return loaded.entries;
}

function saveRecord(ctx, entries) {
  const file = join(ctx.gitDir, RECORD_FILE);

  if (entries.length === 0) {
    rmSync(file, { force: true });

    return;
  }

  const temp = `${file}.${process.pid}.tmp`;

  writeFileSync(temp, `${JSON.stringify({ version: 1, entries }, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temp, file);
}

function dropEntry(ctx, id) {
  const loaded = loadRecord(ctx);

  if (loaded.problem === undefined) {
    saveRecord(
      ctx,
      loaded.entries.filter((entry) => entry.id !== id),
    );
  }
}

function listLockfiles(git, sha) {
  const entries = listTree(git, sha);
  const src = makeSource(git, sha, entries);
  const found = new Map();

  for (const path of src.paths()) {
    const entry = recognisedLockfile(src, path);

    if (entry !== null) {
      found.set(path, { manager: entry.manager, blob: src.blob(path) });
    }
  }

  return found;
}

function dependenciesOf(ctx, path, manager) {
  const names = DEPENDENCY_NAMES.get(manager);

  if (names === undefined) {
    return "unknown";
  }

  const dir = join(ctx.top, dirOf(path));

  return names.some((name) => existsSync(join(dir, name)))
    ? "present"
    : "missing";
}

function changedLockfiles(before, after) {
  const changed = [];

  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const now = after.get(path);

    if (before.get(path)?.blob !== now?.blob) {
      changed.push({ path, manager: (now ?? before.get(path)).manager });
    }
  }

  return sortBy(changed, "path");
}

function planLockfiles(ctx, current, sha) {
  const found = [];

  for (const [path, { manager, blob }] of listLockfiles(ctx.git, sha)) {
    found.push({
      path,
      manager,
      changed: current.get(path)?.blob !== blob,
      dependencies: dependenciesOf(ctx, path, manager),
    });
  }

  return sortBy(found, "path");
}

function sessionConfigPaths(ctx, currentSha, sha) {
  const output = ctx.git.text([
    "diff",
    "--name-only",
    "--no-renames",
    "--no-ext-diff",
    "-z",
    currentSha,
    sha,
    "--",
    ".claude",
    ".mcp.json",
  ]);

  return output
    .split("\0")
    .filter((path) => path !== "")
    .sort(compare);
}

function planCheckout(ctx, entries, problem, clean) {
  const recorded = problem !== undefined || entries.some(isCheckoutEntry);

  if (recorded) {
    return { offered: false, reason: "recorded" };
  }

  const busy = !clean || operationInProgress(ctx) !== undefined;

  return { offered: !busy, reason: busy ? "dirty" : null };
}

function isCheckoutEntry(entry) {
  return entry.kind === "checkout";
}

function runPlan(ctx, shas) {
  if (shas.length === 0) {
    refuse("usage", "plan needs at least one head sha");
  }

  for (const sha of shas) {
    requireCommit(ctx, sha);
  }

  const treeSha = currentHead(ctx);
  const current = listLockfiles(ctx.git, treeSha);
  const loaded = loadRecord(ctx);
  const clean = statusPaths(ctx, false).length === 0;
  const record =
    loaded.problem === undefined
      ? loaded.entries.length === 0
        ? null
        : { entries: loaded.entries }
      : { unreadable: true, detail: loaded.problem };

  return {
    ok: true,
    treeSha,
    branch: currentBranch(ctx),
    clean,
    checkout: planCheckout(ctx, loaded.entries ?? [], loaded.problem, clean),
    record,
    heads: shas.map((sha) => ({
      headSha: sha,
      atTree: sha === treeSha,
      lockfiles: planLockfiles(ctx, current, sha),
      sessionConfig: sessionConfigPaths(ctx, treeSha, sha),
    })),
  };
}

function switchBackArgs(entry) {
  return entry.branch === null
    ? ["switch", "--detach", "--no-overwrite-ignore", entry.fromSha]
    : ["switch", "--no-overwrite-ignore", entry.branch];
}

function switchBackCommand(ctx, entry) {
  const words =
    entry.branch === null
      ? ["switch", "--detach", entry.fromSha]
      : ["switch", entry.branch];

  return ["git", "-C", ctx.top, ...words].map(quoteShell).join(" ");
}

function changeTree(ctx, args) {
  return ctx.git.run([...SAFE_GIT, ...args]);
}

function enterCheckout(ctx, sha, entries) {
  if (entries.some(isCheckoutEntry)) {
    refuse(
      "already-recorded",
      "a check-out is already recorded for this working tree",
    );
  }

  const operation = operationInProgress(ctx);

  if (operation !== undefined) {
    refuse("operation-in-progress", `${operation} exists in the git directory`);
  }

  const dirty = statusPaths(ctx, false);

  if (dirty.length > 0) {
    refuse("dirty", "the working tree has changes", { dirtyPaths: dirty });
  }

  const fromSha = currentHead(ctx);

  if (fromSha === sha) {
    refuse("at-head", "the working tree is already at the head");
  }

  const entry = {
    id: randomUUID(),
    kind: "checkout",
    headSha: sha,
    branch: currentBranch(ctx),
    fromSha,
  };

  saveRecord(ctx, [...entries, entry]);
  switchToHead(ctx, entry);

  return {
    ok: true,
    kind: "checkout",
    headSha: sha,
    from: entry.branch ?? fromSha,
  };
}

function switchToHead(ctx, entry) {
  const result = changeTree(ctx, [
    "switch",
    "--detach",
    "--no-overwrite-ignore",
    entry.headSha,
  ]);

  if (result.status !== 0) {
    dropEntry(ctx, entry.id);
    refuse("switch-failed", result.stderr.trim());
  }

  const dirty = statusPaths(ctx, true);

  if (dirty.length === 0) {
    return;
  }

  const back = changeTree(ctx, switchBackArgs(entry));

  if (back.status !== 0) {
    refuse(
      "switch-back-failed",
      `the head left the tree changed and switching back failed (${back.stderr.trim()}); the record is kept, run ${switchBackCommand(ctx, entry)}`,
      { dirtyPaths: dirty },
    );
  }

  dropEntry(ctx, entry.id);
  refuse(
    "dirty-after-switch",
    "checking out the head leaves the tree changed",
    {
      dirtyPaths: dirty,
    },
  );
}

function makeScratch(entries, kind, sha) {
  const parent = realpathSync(mkdtempSync(join(tmpdir(), SCRATCH_PREFIX)));
  const entry = {
    id: randomUUID(),
    kind,
    headSha: sha,
    path: join(parent, HEAD_DIR),
    parent,
  };

  writeFileSync(join(parent, MARKER_FILE), entry.id);

  return { entry, entries: [...entries, entry] };
}

function abandonScratch(ctx, entry, detail) {
  dropEntry(ctx, entry.id);
  rmSync(entry.parent, { recursive: true, force: true });
  refuse("setup-failed", detail);
}

function enterWorktree(ctx, sha, entries) {
  const scratch = makeScratch(entries, "worktree", sha);

  saveRecord(ctx, scratch.entries);

  const result = changeTree(ctx, [
    "worktree",
    "add",
    "--detach",
    scratch.entry.path,
    sha,
  ]);

  if (result.status !== 0) {
    abandonScratch(ctx, scratch.entry, result.stderr.trim());
  }

  return { ok: true, kind: "worktree", headSha: sha, path: scratch.entry.path };
}

function originUrl(ctx) {
  const result = ctx.git.run(["config", "--get", "remote.origin.url"]);
  const url = result.status === 0 ? result.stdout.trim() : "";

  if (url === "" || url.startsWith("-")) {
    return null;
  }

  return existsSync(resolve(ctx.top, url)) ? resolve(ctx.top, url) : url;
}

function cloneInto(ctx, entry) {
  const common = ctx.git
    .text(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    .trim();
  const cloned = changeTree(ctx, [
    "clone",
    "--shared",
    "--no-checkout",
    common,
    entry.path,
  ]);

  if (cloned.status !== 0) {
    return cloned;
  }

  const inside = makeGit(ctx.gitPath, entry.path);
  const switched = inside.run([
    ...SAFE_GIT,
    "switch",
    "--detach",
    entry.headSha,
  ]);
  const url = originUrl(ctx);

  if (switched.status === 0 && url !== null) {
    inside.run(["remote", "set-url", "origin", url]);
  }

  return switched;
}

function enterClone(ctx, sha, entries) {
  const scratch = makeScratch(entries, "clone", sha);

  saveRecord(ctx, scratch.entries);

  const result = cloneInto(ctx, scratch.entry);

  if (result.status !== 0) {
    abandonScratch(ctx, scratch.entry, result.stderr.trim());
  }

  return {
    ok: true,
    kind: "clone",
    headSha: sha,
    path: scratch.entry.path,
    originRefsAreLocal: true,
  };
}

const ENTERS = new Map([
  ["checkout", enterCheckout],
  ["worktree", enterWorktree],
  ["clone", enterClone],
]);

function runEnter(ctx, [kind, sha]) {
  const enter = ENTERS.get(kind);

  if (enter === undefined) {
    refuse("usage", "enter takes checkout, worktree or clone and a head sha");
  }

  requireCommit(ctx, sha);

  return enter(ctx, sha, requireRecord(ctx));
}

function declineCheckout(ctx, entry, reason, detail, extra = {}) {
  return {
    declined: {
      reason,
      detail,
      command: switchBackCommand(ctx, entry),
      ...extra,
    },
  };
}

function isBackAt(ctx, entry) {
  const branch = currentBranch(ctx);

  return entry.branch === null
    ? branch === null && currentHead(ctx) === entry.fromSha
    : branch === entry.branch;
}

function restoreCheckout(ctx, entry) {
  if (isBackAt(ctx, entry)) {
    return {
      restored: { alreadyBack: true },
      lockfiles: lockfilesSince(ctx, entry),
    };
  }

  const branch = currentBranch(ctx);

  if (branch !== null) {
    return declineCheckout(ctx, entry, "not-detached", `HEAD is on ${branch}`);
  }

  if (currentHead(ctx) !== entry.headSha) {
    return declineCheckout(
      ctx,
      entry,
      "head-moved",
      "HEAD is no longer at the checked-out head; commits made here would be left behind",
    );
  }

  const dirty = statusPaths(ctx, true);

  if (dirty.length > 0) {
    return declineCheckout(
      ctx,
      entry,
      "dirty",
      "the working tree has changes",
      {
        dirtyPaths: dirty,
      },
    );
  }

  const back = changeTree(ctx, switchBackArgs(entry));

  if (back.status !== 0) {
    return declineCheckout(ctx, entry, "switch-failed", back.stderr.trim());
  }

  return { restored: {}, lockfiles: lockfilesSince(ctx, entry) };
}

function lockfilesSince(ctx, entry) {
  return changedLockfiles(
    listLockfiles(ctx.git, entry.headSha),
    listLockfiles(ctx.git, currentHead(ctx)),
  );
}

function listedWorktrees(ctx) {
  const output = ctx.git.text(["worktree", "list", "--porcelain"]);
  const paths = new Set();

  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.add(line.slice("worktree ".length));
    }
  }

  return paths;
}

function realOrSame(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function removeEmptyParent(parent) {
  try {
    rmdirSync(parent);
  } catch {
    // Not empty or already gone: leave it.
  }
}

function restoreWorktree(ctx, entry) {
  const listed = [...listedWorktrees(ctx)].map(realOrSame);
  const isListed = listed.includes(realOrSame(entry.path));

  if (!existsSync(entry.path) && !isListed) {
    return { restored: { missing: true } };
  }

  if (!isListed) {
    return {
      declined: {
        reason: "not-a-worktree",
        detail: `${entry.path} is not a worktree of this repository`,
      },
    };
  }

  const result = changeTree(ctx, ["worktree", "remove", "--force", entry.path]);

  if (result.status !== 0) {
    return {
      declined: { reason: "remove-failed", detail: result.stderr.trim() },
    };
  }

  rmSync(join(entry.parent, MARKER_FILE), { force: true });
  removeEmptyParent(entry.parent);

  return { restored: {} };
}

function describeCloneProblem(entry) {
  const tmp = realOrSame(tmpdir());

  if (isLink(entry.parent) || isLink(entry.path)) {
    return "the clone or its directory is a symlink";
  }

  const parent = realOrSame(entry.parent);

  if (!isInside(tmp, parent) || !basename(parent).startsWith(SCRATCH_PREFIX)) {
    return `${entry.parent} is not a ${SCRATCH_PREFIX}* directory inside the temp directory`;
  }

  if (readMarker(entry.parent) !== entry.id) {
    return "the marker file in the clone's directory does not match the record";
  }

  return realOrSame(entry.path) === join(parent, HEAD_DIR)
    ? null
    : "the clone is not where the record says";
}

function readMarker(parent) {
  try {
    return readFileSync(join(parent, MARKER_FILE), "utf8").trim();
  } catch {
    return null;
  }
}

function restoreClone(_ctx, entry) {
  if (!existsSync(entry.parent)) {
    return { restored: { missing: true } };
  }

  const problem = describeCloneProblem(entry);

  if (problem !== null) {
    return { declined: { reason: "not-ours", detail: problem } };
  }

  rmSync(entry.path, { recursive: true, force: true });
  rmSync(join(entry.parent, MARKER_FILE), { force: true });
  removeEmptyParent(entry.parent);

  return { restored: {} };
}

const RESTORERS = new Map([
  ["checkout", restoreCheckout],
  ["worktree", restoreWorktree],
  ["clone", restoreClone],
]);

function runRestore(ctx) {
  const restored = [];
  const declined = [];
  const lockfiles = [];

  for (const entry of [...requireRecord(ctx)].reverse()) {
    const outcome = RESTORERS.get(entry.kind)(ctx, entry);
    const named = { id: entry.id, kind: entry.kind, headSha: entry.headSha };

    if (outcome.declined === undefined) {
      dropEntry(ctx, entry.id);
      restored.push({ ...named, ...outcome.restored });
      lockfiles.push(...(outcome.lockfiles ?? []));
    } else {
      declined.push({ ...named, ...outcome.declined });
    }
  }

  const summary = {
    restored,
    declined,
    changedLockfiles: sortBy(lockfiles, "path"),
  };

  return declined.length === 0
    ? { ok: true, ...summary }
    : {
        ok: false,
        reason: "declined",
        detail: `${declined.length} recorded setup(s) were left in place`,
        ...summary,
      };
}

function runForget(ctx) {
  const file = join(ctx.gitDir, RECORD_FILE);
  const existed = existsSync(file) || isLink(file);

  rmSync(file, { force: true });

  return { ok: true, forgotten: existed };
}

const COMMANDS = new Map([
  ["plan", runPlan],
  ["enter", runEnter],
  ["restore", runRestore],
  ["forget", runForget],
]);

function run(argv) {
  const [name, ...args] = argv;
  const command = COMMANDS.get(name);

  if (command === undefined) {
    refuse("usage", "usage: head-setup.mjs plan|enter|restore|forget ...");
  }

  return command(makeContext(), args);
}

function main() {
  let result = null;

  try {
    result = run(process.argv.slice(2));
  } catch (error) {
    result =
      error instanceof Refusal
        ? {
            ok: false,
            reason: error.reason,
            detail: error.message,
            ...error.extra,
          }
        : {
            ok: false,
            reason: "error",
            detail: String(error?.message ?? error),
          };
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  return result.ok ? 0 : 1;
}

process.exitCode = main();
