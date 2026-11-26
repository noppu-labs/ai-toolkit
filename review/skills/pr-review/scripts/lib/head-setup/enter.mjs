import { enterCheckout } from "./checkout-enter.mjs";
import { enterClone } from "./clone.mjs";
import { refuse } from "./context.mjs";
import { requireRecord } from "./record-store.mjs";
import { requireCommit } from "./status.mjs";
import { enterWorktree } from "./worktree.mjs";

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

export function runEnter(ctx, args) {
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
