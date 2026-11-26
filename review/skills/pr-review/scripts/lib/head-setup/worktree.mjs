import { rmSync } from "node:fs";
import { join } from "node:path";
import { changeTree } from "./checkout-enter.mjs";
import { MARKER_FILE } from "./constants.mjs";
import { showPath } from "./display.mjs";
import { FORGET_HINT } from "./printed-commands.mjs";
import {
  abandonScratch,
  describeCloneProblem,
  describeParentProblem,
  listedWorktrees,
  makeScratch,
  realOrSame,
  recordScratch,
  removeEmptyParent,
  resolveRoot,
  restoreUnlisted,
} from "./scratch.mjs";

export function enterWorktree(ctx, sha, entries, requested) {
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

export function restoreWorktree(ctx, entry) {
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
