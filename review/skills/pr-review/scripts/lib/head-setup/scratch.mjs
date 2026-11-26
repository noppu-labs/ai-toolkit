import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { HEAD_DIR, MARKER_FILE, SCRATCH_PREFIX } from "./constants.mjs";
import { refuse } from "./context.mjs";
import { isInside } from "./display.mjs";
import { FORGET_HINT } from "./printed-commands.mjs";
import { dropEntry, isLink, saveRecord } from "./record-store.mjs";

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

export function resolveRoot(ctx, requested) {
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

export function makeScratch(entries, kind, sha, root) {
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

export function recordScratch(ctx, scratch) {
  try {
    saveRecord(ctx, scratch.entries);
  } catch (error) {
    rmSync(scratch.entry.parent, { recursive: true, force: true });
    throw error;
  }
}

export function abandonScratch(ctx, entry, detail) {
  dropEntry(ctx, entry.id);
  rmSync(entry.parent, { recursive: true, force: true });
  refuse("setup-failed", detail);
}

export function listedWorktrees(ctx) {
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
export function realOrSame(path) {
  try {
    return realpathSync(path).normalize("NFC");
  } catch {
    return path.normalize("NFC");
  }
}

export function removeEmptyParent(parent) {
  try {
    rmdirSync(parent);
  } catch {
    // Not empty or already gone: leave it.
  }
}

export function removeScratch(entry) {
  rmSync(entry.path, { recursive: true, force: true });
  rmSync(join(entry.parent, MARKER_FILE), { force: true });
  removeEmptyParent(entry.parent);
}

// Git no longer lists the path: a crash before `worktree add`, a removal that
// stopped half-way, or a directory that was never ours. The marker the run
// wrote decides which, under the same guards as a clone.
export function restoreUnlisted(entry) {
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

export function describeParentProblem(entry) {
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

export function describeCloneProblem(entry) {
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
