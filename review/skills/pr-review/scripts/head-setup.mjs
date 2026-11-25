#!/usr/bin/env node

// Set up and undo the checkout a PR review reads its head from. One JSON object
// on stdout; exit 0 on success, 1 when it refuses or fails with
// { "ok": false, "reason": "...", "detail": "..." }.
//
// Usage (run anywhere inside the working tree):
//   node head-setup.mjs plan <head-sha>...
//   node head-setup.mjs enter checkout|worktree|clone <head-sha>
//   node head-setup.mjs restore [<id>...]
//   node head-setup.mjs forget
//
// It never installs anything and never runs a file from the tree. Every git
// call is an argument array to the absolute git path; calls that change a
// working tree also disable hooks and submodule recursion. What `restore` needs
// is recorded in the per-worktree git directory before anything changes.

import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
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
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { findExecutable } from "./lib/exec.mjs";
import { makeGit } from "./lib/git.mjs";
import { recognisedLockfile } from "./lib/lockfiles.mjs";
import { dirOf } from "./lib/paths.mjs";
import { compare, sortBy } from "./lib/sort.mjs";
import { listTree, makeSource } from "./lib/tree.mjs";

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const RECORD_FILE = "pr-review-setup.json";
const LOCK_FILE = "pr-review-setup.lock";
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
const SESSION_PATHSPECS = [
  ":(icase).claude",
  ":(icase).mcp.json",
  ":(glob,icase)**/.claude/**",
  ":(glob,icase)**/.mcp.json",
  ":(glob,icase)**/opencode.json",
  ":(glob,icase)**/opencode.jsonc",
  ":(glob,icase)**/.opencode/**",
  ":(glob,icase)**/CLAUDE.md",
  ":(glob,icase)**/CLAUDE.local.md",
  ":(glob,icase)**/AGENTS.md",
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

  // Calls that change the tree run in the session's own directory, so git keeps
  // it when the head removes it.
  const session = makeGit(gitPath, process.cwd());

  return { gitPath, git, session, top, gitDir };
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

// A path is data: a control character in it would print as a line break or an
// escape sequence wherever the path is shown.
function showPath(path) {
  return [...path]
    .map((char) => {
      const code = char.codePointAt(0);

      if (code === 10) {
        return "\\n";
      }

      if (code === 13) {
        return "\\r";
      }

      if (code === 9) {
        return "\\t";
      }

      return code < 32 || code === 127 || (code >= 128 && code <= 159)
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : char;
    })
    .join("");
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
    .map((record) => showPath(record.slice(3)));
}

// A required clean filter that fails makes `git status` itself fail, so the
// callers that must not lose the id ask for a result instead of an exception.
function tryStatusPaths(ctx, ignoreSubmodules) {
  try {
    return { paths: statusPaths(ctx, ignoreSubmodules) };
  } catch (error) {
    return { failed: showPath(String(error?.message ?? error)) };
  }
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
  const paths = [entry.root, entry.path, entry.parent];

  if (!paths.every((path) => typeof path === "string" && isAbsolute(path))) {
    return `entry ${entry.id} has a path that is not absolute`;
  }

  if (
    entry.path !== join(entry.parent, HEAD_DIR) ||
    dirname(entry.parent) !== entry.root ||
    !basename(entry.parent).startsWith(SCRATCH_PREFIX)
  ) {
    return `entry ${entry.id} has a path outside a ${SCRATCH_PREFIX}* directory inside its root`;
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

  try {
    writeFileSync(
      temp,
      `${JSON.stringify({ version: 1, entries }, null, 2)}\n`,
      { mode: 0o600 },
    );
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    refuse(
      "record-write-failed",
      `the record cannot be written: ${error.message}`,
    );
  }
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
      changed.push({
        path,
        manager: (now ?? before.get(path)).manager,
        exists: now !== undefined,
      });
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
    ...SESSION_PATHSPECS,
  ]);

  return output
    .split("\0")
    .filter((path) => path !== "")
    .sort(compare)
    .map(showPath);
}

function planCheckout(ctx, entries, problem, clean, atTarget) {
  const recorded = problem !== undefined || entries.some(isCheckoutEntry);

  if (recorded) {
    return { offered: false, reason: "recorded" };
  }

  if (atTarget) {
    return { offered: false, reason: "at-head" };
  }

  const busy = !clean || operationInProgress(ctx) !== undefined;

  return { offered: !busy, reason: busy ? "dirty" : null };
}

function isCheckoutEntry(entry) {
  return entry.kind === "checkout";
}

function describeRecord(loaded) {
  if (loaded.problem !== undefined) {
    return { unreadable: true, detail: loaded.problem };
  }

  return loaded.entries.length === 0 ? null : { entries: loaded.entries };
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

  return {
    ok: true,
    treeSha,
    branch: currentBranch(ctx),
    clean,
    checkout: planCheckout(
      ctx,
      loaded.entries ?? [],
      loaded.problem,
      clean,
      shas.at(-1) === treeSha,
    ),
    record: describeRecord(loaded),
    heads: shas.map((sha) => ({
      headSha: sha,
      atTree: sha === treeSha,
      lockfiles: planLockfiles(ctx, current, sha),
      sessionConfig: sessionConfigPaths(ctx, treeSha, sha),
    })),
  };
}

function switchBackArgs(entry, discard = false) {
  const flags = discard ? ["--discard-changes"] : [];

  return entry.branch === null
    ? ["switch", ...flags, "--detach", "--no-overwrite-ignore", entry.fromSha]
    : ["switch", ...flags, "--no-guess", "--no-overwrite-ignore", entry.branch];
}

function branchExists(ctx, branch) {
  return (
    ctx.git.run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])
      .status === 0
  );
}

// What a person should run: the plain switch back, or, when the branch is gone,
// the one that makes it again where the check-out started.
function printedArgs(ctx, entry, discard) {
  if (entry.branch === null || branchExists(ctx, entry.branch)) {
    return switchBackArgs(entry, discard);
  }

  return [
    "switch",
    ...(discard ? ["--discard-changes"] : []),
    "--no-overwrite-ignore",
    "-c",
    entry.branch,
    entry.fromSha,
  ];
}

function shellLine(words) {
  return words.map(quoteShell).join(" ");
}

function switchBackCommand(ctx, entry, discard = false) {
  return shellLine([
    "git",
    ...SAFE_GIT,
    "-C",
    ctx.top,
    ...printedArgs(ctx, entry, discard),
  ]);
}

function keepCommitsCommand(ctx, entry, sha) {
  const keep = shellLine([
    "git",
    "-C",
    ctx.top,
    "branch",
    "-f",
    `pr-review-kept-${sha.slice(0, 12)}`,
    sha,
  ]);

  return `${keep} && ${switchBackCommand(ctx, entry)}`;
}

function changeTree(ctx, args) {
  return ctx.session.run([...SAFE_GIT, ...args]);
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
    id: entry.id,
    kind: "checkout",
    headSha: sha,
    from: entry.branch ?? fromSha,
  };
}

const DISCARD_NOTE =
  "The command discards every change to tracked files made since, the listed ones included, and leaves untracked ones.";

// A switch that exits non-zero can still have written files first. Only a
// clean tree means nothing changed and the record can go. The paths and the
// command are fields of their own: `detail` repeats text git printed, which
// can carry text from the PR.
function refuseIncomplete(ctx, entry, reason, lead, dirtyPaths) {
  refuse(
    reason,
    `${lead}; the record is kept. Keep the id ${entry.id} and print the paths. ${DISCARD_NOTE}`,
    {
      id: entry.id,
      dirtyPaths,
      command: switchBackCommand(ctx, entry, true),
    },
  );
}

function refuseFailedSwitch(ctx, entry, stderr) {
  const status = tryStatusPaths(ctx, false);

  if (status.failed === undefined && status.paths.length === 0) {
    dropEntry(ctx, entry.id);
    refuse("switch-failed", showPath(stderr));
  }

  refuseIncomplete(
    ctx,
    entry,
    "switch-incomplete",
    `${showPath(stderr)}; the switch may have changed the tree before it failed`,
    status.paths ?? [],
  );
}

function switchToHead(ctx, entry) {
  const result = changeTree(ctx, [
    "switch",
    "--detach",
    "--no-overwrite-ignore",
    entry.headSha,
  ]);

  if (result.status !== 0) {
    refuseFailedSwitch(ctx, entry, result.stderr.trim());
  }

  const status = tryStatusPaths(ctx, true);

  if (status.failed !== undefined) {
    refuseIncomplete(
      ctx,
      entry,
      "switch-incomplete",
      `git status failed after the switch (${status.failed})`,
      [],
    );
  }

  const dirty = status.paths;

  if (dirty.length === 0) {
    return;
  }

  const back = changeTree(ctx, switchBackArgs(entry));

  if (back.status !== 0) {
    refuseIncomplete(
      ctx,
      entry,
      "switch-back-failed",
      `the head left the tree changed and switching back failed (${showPath(back.stderr.trim())})`,
      dirty,
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

function describeRootProblem(dir) {
  if (dir === "" || !isAbsolute(dir)) {
    return "it must be an absolute path";
  }

  try {
    const stat = lstatSync(dir);

    return stat.isDirectory() && !stat.isSymbolicLink()
      ? null
      : "it must be a real directory, not a symlink or a file";
  } catch {
    return "it does not exist";
  }
}

function describeOverlap(ctx, root, explicit) {
  const common = ctx.git
    .text(["rev-parse", "--path-format=absolute", "--git-common-dir"])
    .trim();

  for (const tree of [realOrSame(ctx.top), realOrSame(common)]) {
    if (root === tree || isInside(tree, root)) {
      return `it is inside ${tree}`;
    }

    if (explicit && isInside(root, tree)) {
      return `it contains ${tree}`;
    }
  }

  return null;
}

function resolveRoot(ctx, requested) {
  const explicit = requested !== null;
  const problem = explicit ? describeRootProblem(requested) : null;

  if (problem !== null) {
    refuse("bad-scratch", `--scratch ${requested}: ${problem}`);
  }

  const root = realOrSame(explicit ? requested : tmpdir());
  const overlap = describeOverlap(ctx, root, explicit);

  if (overlap !== null) {
    refuse(
      "bad-scratch",
      `the scratch directory ${root} is unusable: ${overlap}`,
    );
  }

  return root;
}

function makeScratch(entries, kind, sha, root) {
  const parent = realpathSync(mkdtempSync(join(root, SCRATCH_PREFIX)));
  const entry = {
    id: randomUUID(),
    kind,
    headSha: sha,
    root,
    path: join(parent, HEAD_DIR),
    parent,
  };

  writeFileSync(join(parent, MARKER_FILE), entry.id);

  return { entry, entries: [...entries, entry] };
}

function recordScratch(ctx, scratch) {
  try {
    saveRecord(ctx, scratch.entries);
  } catch (error) {
    rmSync(scratch.entry.parent, { recursive: true, force: true });
    throw error;
  }
}

function abandonScratch(ctx, entry, detail) {
  dropEntry(ctx, entry.id);
  rmSync(entry.parent, { recursive: true, force: true });
  refuse("setup-failed", detail);
}

function enterWorktree(ctx, sha, entries, requested) {
  const scratch = makeScratch(
    entries,
    "worktree",
    sha,
    resolveRoot(ctx, requested),
  );

  recordScratch(ctx, scratch);

  const result = changeTree(ctx, [
    "worktree",
    "add",
    "--detach",
    scratch.entry.path,
    sha,
  ]);

  if (result.status !== 0) {
    abandonScratch(ctx, scratch.entry, showPath(result.stderr.trim()));
  }

  return {
    ok: true,
    id: scratch.entry.id,
    kind: "worktree",
    headSha: sha,
    path: scratch.entry.path,
  };
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

function enterClone(ctx, sha, entries, requested) {
  const scratch = makeScratch(
    entries,
    "clone",
    sha,
    resolveRoot(ctx, requested),
  );

  recordScratch(ctx, scratch);

  const result = cloneInto(ctx, scratch.entry);

  if (result.status !== 0) {
    abandonScratch(ctx, scratch.entry, showPath(result.stderr.trim()));
  }

  return {
    ok: true,
    id: scratch.entry.id,
    kind: "clone",
    headSha: sha,
    path: scratch.entry.path,
  };
}

const ENTERS = new Map([
  ["checkout", enterCheckout],
  ["worktree", enterWorktree],
  ["clone", enterClone],
]);

function takeScratch(args) {
  const rest = [...args];
  const at = rest.indexOf("--scratch");

  if (at === -1) {
    return { rest, scratch: null };
  }

  const scratch = rest[at + 1] ?? "";

  rest.splice(at, 2);

  return { rest, scratch };
}

function runEnter(ctx, args) {
  const {
    rest: [kind, sha],
    scratch,
  } = takeScratch(args);
  const enter = ENTERS.get(kind);

  if (enter === undefined) {
    refuse("usage", "enter takes checkout, worktree or clone and a head sha");
  }

  if (scratch !== null && kind === "checkout") {
    refuse("usage", "--scratch applies to worktree and clone only");
  }

  requireCommit(ctx, sha);

  return enter(ctx, sha, requireRecord(ctx), scratch);
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

// A decline for a status that could not run: the tree may hold the head's
// files, so the command that discards tracked changes is the one to print.
function declineStatus(ctx, entry, failed) {
  return declineCheckout(
    ctx,
    entry,
    "status-failed",
    `git status failed (${failed}); the tree may hold files of the head. ${DISCARD_NOTE}`,
    { command: switchBackCommand(ctx, entry, true) },
  );
}

function restoreCheckout(ctx, entry) {
  const indexLock = join(ctx.gitDir, "index.lock");

  if (existsSync(indexLock)) {
    return {
      declined: {
        reason: "busy",
        detail: `${indexLock} exists, so a git may still be switching this tree; run restore again when it ends, or delete the file if no git is running`,
      },
    };
  }

  if (isBackAt(ctx, entry)) {
    return restoreBack(ctx, entry);
  }

  const branch = currentBranch(ctx);

  if (branch !== null) {
    return declineCheckout(ctx, entry, "not-detached", `HEAD is on ${branch}`);
  }

  const head = currentHead(ctx);

  if (head !== entry.headSha) {
    return declineCheckout(
      ctx,
      entry,
      "head-moved",
      "HEAD is no longer at the checked-out head; the command first keeps the current commit on a branch",
      { command: keepCommitsCommand(ctx, entry, head) },
    );
  }

  const status = tryStatusPaths(ctx, true);

  if (status.failed !== undefined) {
    return declineStatus(ctx, entry, status.failed);
  }

  if (status.paths.length > 0) {
    return declineCheckout(
      ctx,
      entry,
      "dirty",
      `the working tree has changes. If the listed paths are not yours, run ${switchBackCommand(ctx, entry, true)} instead of the command. ${DISCARD_NOTE}`,
      { dirtyPaths: status.paths },
    );
  }

  if (entry.branch !== null && !branchExists(ctx, entry.branch)) {
    return declineCheckout(
      ctx,
      entry,
      "branch-gone",
      `the branch ${entry.branch} no longer exists; the command makes it again at ${entry.fromSha}`,
    );
  }

  const back = changeTree(ctx, switchBackArgs(entry));

  if (back.status !== 0) {
    return declineAfterFailedBack(ctx, entry, back.stderr.trim());
  }

  return { restored: {}, lockfiles: lockfilesSince(ctx, entry) };
}

// A switch back that fails may still have written files; then only the
// discard form can work.
function declineAfterFailedBack(ctx, entry, stderr) {
  const status = tryStatusPaths(ctx, true);

  if (status.failed === undefined && status.paths.length === 0) {
    return declineCheckout(ctx, entry, "switch-failed", showPath(stderr));
  }

  return declineCheckout(
    ctx,
    entry,
    "switch-incomplete",
    `${showPath(stderr)}; the switch back changed the tree before it failed. ${DISCARD_NOTE}`,
    {
      dirtyPaths: status.paths ?? [],
      command: switchBackCommand(ctx, entry, true),
    },
  );
}

// HEAD is where the run started, but a switch that was cut short, or an edit
// made since, can leave the tree changed. Only a clean tree drops the record.
function restoreBack(ctx, entry) {
  const status = tryStatusPaths(ctx, true);

  if (status.failed !== undefined) {
    return declineStatus(ctx, entry, status.failed);
  }

  if (status.paths.length > 0) {
    return {
      declined: {
        reason: "back-but-dirty",
        detail:
          "HEAD is back where the run started, but the working tree has changes, so the record is kept. If you switched back yourself and these changes are yours, run `head-setup.mjs forget`: it clears every recorded setup, so restore the others first (a worktree it clears stays registered with git).",
        dirtyPaths: status.paths,
      },
    };
  }

  return {
    restored: { alreadyBack: true },
    lockfiles: lockfilesSince(ctx, entry),
  };
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

// macOS keeps a name as it was made but git lists it composed, so two spellings
// of one path compare equal only once both are normalised.
function realOrSame(path) {
  try {
    return realpathSync(path).normalize("NFC");
  } catch {
    return path.normalize("NFC");
  }
}

function removeEmptyParent(parent) {
  try {
    rmdirSync(parent);
  } catch {
    // Not empty or already gone: leave it.
  }
}

function removeScratch(entry) {
  rmSync(entry.path, { recursive: true, force: true });
  rmSync(join(entry.parent, MARKER_FILE), { force: true });
  removeEmptyParent(entry.parent);
}

// Git no longer lists the path: a crash before `worktree add`, a removal that
// stopped half-way, or a directory that was never ours. The marker the run
// wrote decides which, under the same guards as a clone.
function restoreUnlisted(entry) {
  const ours = existsSync(entry.parent) && describeCloneProblem(entry) === null;

  if (ours) {
    const present = existsSync(entry.path);

    removeScratch(entry);

    return { restored: present ? { leftover: true } : { missing: true } };
  }

  if (!existsSync(entry.path)) {
    return { restored: { missing: true } };
  }

  return {
    declined: {
      reason: "not-a-worktree",
      detail: `${entry.path} is not a worktree of this repository${FORGET_HINT}`,
    },
  };
}

const FORGET_HINT =
  "; if the entry is not wanted, `head-setup.mjs forget` drops every record (restore the others first)";

// The reason of the lock git put on a worktree, or null. A run killed inside
// `worktree add` leaves it locked as `initializing`, which `--force` alone
// does not remove.
function lockReason(ctx, path) {
  const target = realOrSame(path);
  let current = null;

  for (const line of ctx.git
    .text(["worktree", "list", "--porcelain"])
    .split("\n")) {
    if (line.startsWith("worktree ")) {
      current = realOrSame(line.slice("worktree ".length));
    } else if (current === target && line.startsWith("locked")) {
      return line.slice("locked".length).trim();
    }
  }

  return null;
}

function removeWorktree(ctx, entry) {
  const result = changeTree(ctx, ["worktree", "remove", "--force", entry.path]);

  if (
    result.status === 0 ||
    lockReason(ctx, entry.path) !== "initializing" ||
    describeCloneProblem(entry) !== null
  ) {
    return result;
  }

  return changeTree(ctx, [
    "worktree",
    "remove",
    "--force",
    "--force",
    entry.path,
  ]);
}

function restoreWorktree(ctx, entry) {
  const listed = [...listedWorktrees(ctx)].map(realOrSame);
  const isListed = listed.includes(realOrSame(entry.path));

  if (!isListed) {
    return restoreUnlisted(entry);
  }

  const problem = describeParentProblem(entry);

  if (problem !== null) {
    return {
      declined: { reason: "not-ours", detail: `${problem}${FORGET_HINT}` },
    };
  }

  const result = removeWorktree(ctx, entry);

  if (result.status !== 0) {
    return {
      declined: {
        reason: "remove-failed",
        detail: showPath(result.stderr.trim()),
      },
    };
  }

  rmSync(join(entry.parent, MARKER_FILE), { force: true });
  removeEmptyParent(entry.parent);

  return { restored: {} };
}

function describeParentProblem(entry) {
  if (isLink(entry.parent) || isLink(entry.path)) {
    return "the scratch directory or its head directory is a symlink";
  }

  const parent = realOrSame(entry.parent);

  if (
    dirname(parent) !== realOrSame(entry.root) ||
    !basename(parent).startsWith(SCRATCH_PREFIX)
  ) {
    return `${entry.parent} is not a ${SCRATCH_PREFIX}* directory directly inside the recorded root`;
  }

  return null;
}

function describeCloneProblem(entry) {
  const problem = describeParentProblem(entry);

  if (problem !== null) {
    return problem;
  }

  if (readMarker(entry.parent) !== entry.id) {
    return "the marker file in the clone's directory does not match the record";
  }

  return realOrSame(entry.path) === join(realOrSame(entry.parent), HEAD_DIR)
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
    return {
      declined: { reason: "not-ours", detail: `${problem}${FORGET_HINT}` },
    };
  }

  removeScratch(entry);

  return { restored: {} };
}

const RESTORERS = new Map([
  ["checkout", restoreCheckout],
  ["worktree", restoreWorktree],
  ["clone", restoreClone],
]);

function checkIds(ids, recorded) {
  for (const id of ids) {
    if (!UUID.test(id)) {
      refuse("bad-id", `${id} is not an entry id printed by enter`, {
        recorded,
      });
    }
  }
}

function restoreEntry(ctx, entry) {
  try {
    return RESTORERS.get(entry.kind)(ctx, entry);
  } catch (error) {
    return {
      declined: {
        reason: "error",
        detail: `${showPath(String(error?.message ?? error))}${FORGET_HINT}`,
      },
    };
  }
}

function runRestore(ctx, ids) {
  const restored = [];
  const lockfiles = [];
  const entries = requireRecord(ctx);

  checkIds(ids, entries.length);

  const declined = ids
    .filter((id) => !entries.some((entry) => entry.id === id))
    .map((id) => ({
      id,
      reason: "unknown-id",
      detail: `${id} is not recorded for this working tree`,
    }));
  const chosen =
    ids.length === 0 ? entries : entries.filter((e) => ids.includes(e.id));

  for (const entry of [...chosen].reverse()) {
    const outcome = restoreEntry(ctx, entry);
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
    recorded: entries.length,
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

function isAlive(pid) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function readLockPid(file) {
  try {
    const text = readFileSync(file, "utf8").trim();

    return /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
  } catch {
    return null;
  }
}

// The pid is written to a temporary file that is then linked into place, so
// the lock never exists without it and a reader cannot mistake a lock that is
// still being made for an unreadable one. A filesystem without hard links
// gets an exclusive create instead.
const NO_LINK_CODES = ["ENOTSUP", "EOPNOTSUPP", "EPERM", "ENOSYS"];

function createLock(file) {
  const temp = `${file}.${process.pid}.tmp`;

  try {
    writeFileSync(temp, String(process.pid), { flag: "wx" });
    linkSync(temp, file);

    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }

    if (NO_LINK_CODES.includes(error.code)) {
      return createLockWithoutLink(file);
    }

    throw error;
  } finally {
    rmSync(temp, { force: true });
  }
}

function createLockWithoutLink(file) {
  try {
    writeFileSync(file, String(process.pid), { flag: "wx" });

    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      return false;
    }

    throw error;
  }
}

function takeLock(ctx) {
  const file = join(ctx.gitDir, LOCK_FILE);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (createLock(file)) {
      return file;
    }

    // A lock its holder released since the failed create is not stale: take
    // it by creating it again, never by removing whatever is there now.
    if (!existsSync(file)) {
      continue;
    }

    const pid = readLockPid(file);

    if (pid !== null && isAlive(pid)) {
      refuse(
        "busy",
        `process ${pid} is running head-setup.mjs in this working tree; run one at a time. If none is running, delete ${file}`,
      );
    }

    rmSync(file, { force: true });
  }

  refuse("busy", `${file} could not be taken`);
}

function releaseLock(file) {
  try {
    rmSync(file, { force: true });
  } catch {
    // A stale lock is taken over by the next run; it must not hide the result.
  }
}

// enter, restore and forget read the record, change a tree and write the
// record again, so two at once would lose one of the entries.
function locked(command) {
  return (ctx, args) => {
    const file = takeLock(ctx);

    try {
      return command(ctx, args);
    } finally {
      releaseLock(file);
    }
  };
}

const COMMANDS = new Map([
  ["plan", runPlan],
  ["enter", locked(runEnter)],
  ["restore", locked(runRestore)],
  ["forget", locked(runForget)],
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
