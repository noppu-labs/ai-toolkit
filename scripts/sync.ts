#!/usr/bin/env -S npx tsx
// CLI entrypoint for the skills sync tool, run via `npm run sync`. The only
// file that reads process state (import.meta.url, argv); the skills-sync/
// modules take `root` and argv as parameters so tests can drive them against
// temp dirs.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMain } from "./skills-sync/cli.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

runMain(root, process.argv.slice(2));
