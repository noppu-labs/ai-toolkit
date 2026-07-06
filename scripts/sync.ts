#!/usr/bin/env -S npx tsx
// CLI entrypoint for the skills sync tool. Kept thin and separate from
// skills-sync.ts so the library module stays free of import.meta and imports
// cleanly everywhere (tsx, vitest, jest/ts-jest). Run via `npm run sync`.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMain } from "./skills-sync.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
runMain(root, process.argv.slice(2));
