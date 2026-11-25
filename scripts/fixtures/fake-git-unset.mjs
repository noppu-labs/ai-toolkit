#!/usr/bin/env node
// Stands in for a git that ignores safe.bareRepository, as git older than 2.38
// does: drops that setting from the arguments and runs the git FAKE_GIT_REAL
// names with the rest. With FAKE_GIT_LOG set, it first appends the arguments it
// was given to that file, one JSON array per line.
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const SETTING = "safe.bareRepository=explicit";
const args = process.argv.slice(2);

if (process.env.FAKE_GIT_LOG) {
  appendFileSync(process.env.FAKE_GIT_LOG, `${JSON.stringify(args)}\n`);
}

const at = args.indexOf(SETTING);
if (at > 0 && args[at - 1] === "-c") args.splice(at - 1, 2);

const res = spawnSync(process.env.FAKE_GIT_REAL ?? "", args, {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
