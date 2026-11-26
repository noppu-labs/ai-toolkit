import { existsSync } from "node:fs";
import { join } from "node:path";
import { EVERY_FILE_NO_SUBMODULES, TRACKED_CHANGES } from "./constants.mjs";
import { changeTree } from "./context.mjs";
import { showPath } from "./display.mjs";
import { changedLockfiles, listLockfiles } from "./lockfile-changes.mjs";
import {
  branchExists,
  DISCARD_NOTE,
  keepCommitsCommand,
  switchBackArgs,
  switchBackCommand,
} from "./printed-commands.mjs";
import {
  currentBranch,
  currentHead,
  tryStatusPaths,
  untrackedFiles,
  untrackedPaths,
} from "./status.mjs";

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

export function restoreCheckout(ctx, entry) {
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

  const status = tryStatusPaths(ctx, TRACKED_CHANGES);

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

  const before = untrackedFiles(ctx);
  const back = changeTree(ctx, switchBackArgs(entry));

  if (back.status !== 0) {
    return declineAfterFailedBack(ctx, entry, back.stderr.trim(), before);
  }

  return {
    restored: { untracked: untrackedPaths(ctx) },
    lockfiles: lockfilesSince(ctx, entry),
  };
}

// A switch back that fails may still have written files; then only the
// discard form can work. A status that shows only the untracked files that were
// there before means git wrote nothing: it refused over those files, and the
// discard form refuses too.
function declineAfterFailedBack(ctx, entry, stderr, untrackedBefore) {
  const status = tryStatusPaths(ctx, EVERY_FILE_NO_SUBMODULES);
  const nothingNew =
    status.failed === undefined &&
    status.paths.every((path) => untrackedBefore.includes(path));

  if (nothingNew) {
    const inTheWay = pathsInTheWay(ctx, entry, untrackedBefore);

    return inTheWay.length === 0
      ? declineCheckout(ctx, entry, "switch-failed", showPath(stderr))
      : {
          declined: {
            reason: "switch-failed",
            detail: `${showPath(stderr)}; untracked files are in the way. Move them aside, then run restore again.`,
            dirtyPaths: inTheWay,
          },
        };
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

// The untracked files the user's branch tracks too: what git refuses to
// overwrite. Empty when there are none or when that cannot be told.
function pathsInTheWay(ctx, entry, untracked) {
  const target =
    entry.branch === null ? entry.fromSha : `refs/heads/${entry.branch}`;
  const listing = ctx.git.run(["ls-tree", "-r", "-z", "--name-only", target]);

  if (listing.status !== 0) {
    return [];
  }

  const tracked = new Set(
    listing.stdout
      .split("\0")
      .filter((path) => path !== "")
      .map(showPath),
  );

  return untracked.filter((path) => tracked.has(path));
}

// HEAD is where the run started, but a switch that was cut short, or an edit
// made since, can leave the tree changed. Only a clean tree drops the record.
function restoreBack(ctx, entry) {
  const status = tryStatusPaths(ctx, TRACKED_CHANGES);

  if (status.failed !== undefined) {
    return declineStatus(ctx, entry, status.failed);
  }

  if (status.paths.length > 0 && entry.incomplete === true) {
    return declineCheckout(
      ctx,
      entry,
      "back-but-dirty",
      `HEAD is back where the run started, but the head left the tree changed and the record is kept. ${DISCARD_NOTE}`,
      {
        dirtyPaths: status.paths,
        command: switchBackCommand(ctx, entry, true),
      },
    );
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
    restored: { alreadyBack: true, untracked: untrackedPaths(ctx) },
    lockfiles: lockfilesSince(ctx, entry),
  };
}

function lockfilesSince(ctx, entry) {
  return changedLockfiles(
    listLockfiles(ctx.git, entry.headSha),
    listLockfiles(ctx.git, currentHead(ctx)),
  );
}
