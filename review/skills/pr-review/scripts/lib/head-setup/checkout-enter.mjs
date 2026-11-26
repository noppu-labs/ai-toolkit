import { randomUUID } from "node:crypto";
import { ALL_CHANGES, SAFE_GIT, TRACKED_CHANGES } from "./constants.mjs";
import { refuse } from "./context.mjs";
import { showPath } from "./display.mjs";
import {
  DISCARD_NOTE,
  switchBackArgs,
  switchBackCommand,
} from "./printed-commands.mjs";
import { isCheckoutEntry } from "./record.mjs";
import { dropEntry, markIncomplete, saveRecord } from "./record-store.mjs";
import {
  currentBranch,
  currentHead,
  operationInProgress,
  statusPaths,
  tryStatusPaths,
} from "./status.mjs";

export function changeTree(ctx, args) {
  return ctx.session.run([...SAFE_GIT, ...args]);
}

export function enterCheckout(ctx, sha, entries) {
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

  const dirty = statusPaths(ctx, ALL_CHANGES);

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

// A switch that exits non-zero can still have written files first. Only a
// clean tree means nothing changed and the record can go. The paths and the
// command are fields of their own: `detail` repeats text git printed, which
// can carry text from the PR.
function refuseIncomplete(ctx, entry, reason, lead, dirtyPaths) {
  markIncomplete(ctx, entry.id);
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
  const status = tryStatusPaths(ctx, ALL_CHANGES);

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

  const status = tryStatusPaths(ctx, TRACKED_CHANGES);

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

  // A switch back that exits 0 can still leave files behind: on a
  // case-insensitive filesystem a head with `README.md` and `readme.md` makes
  // it unlink the user's file. Only a clean tree lets the record go.
  const after = tryStatusPaths(ctx, ALL_CHANGES);

  if (after.failed !== undefined || after.paths.length > 0) {
    refuseIncomplete(
      ctx,
      entry,
      "switch-incomplete",
      after.failed === undefined
        ? "the head left the tree changed and the switch back left it changed too"
        : `the head left the tree changed and git status failed after the switch back (${after.failed})`,
      after.paths ?? [],
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
