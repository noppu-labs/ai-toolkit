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

import { makeContext, Refusal, refuse } from "./lib/head-setup/context.mjs";
import { runEnter } from "./lib/head-setup/enter.mjs";
import { runForget } from "./lib/head-setup/forget.mjs";
import { locked } from "./lib/head-setup/lock.mjs";
import { runPlan } from "./lib/head-setup/plan.mjs";
import { runRestore } from "./lib/head-setup/restore.mjs";

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
