import { sortBy } from "../sort.mjs";
import { restoreCheckout } from "./checkout-restore.mjs";
import { restoreClone } from "./clone.mjs";
import { UUID } from "./constants.mjs";
import { refuse } from "./context.mjs";
import { showPath } from "./display.mjs";
import { FORGET_HINT } from "./printed-commands.mjs";
import { dropEntry, requireRecord } from "./record-store.mjs";
import { restoreWorktree } from "./worktree.mjs";

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

export function runRestore(ctx, ids) {
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
