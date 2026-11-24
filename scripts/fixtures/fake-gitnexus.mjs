#!/usr/bin/env node
// Stands in for gitnexus: `list` prints FAKE_GITNEXUS_LIST and exits with
// FAKE_GITNEXUS_EXIT (default 0); `context` prints FAKE_GITNEXUS_CONTEXT, and
// with FAKE_GITNEXUS_REPO set, fails unless `--repo` names exactly that. With
// FAKE_ARGV_FILE set, it writes its arguments there as JSON.
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const [command] = args;

if (process.env.FAKE_ARGV_FILE) {
  writeFileSync(process.env.FAKE_ARGV_FILE, JSON.stringify(args));
}

if (command === "--version") {
  process.stdout.write("gitnexus 0.0.0-fake\n");
  process.exit(0);
}
if (command === "list") {
  process.stdout.write(process.env.FAKE_GITNEXUS_LIST ?? "");
  process.exit(Number(process.env.FAKE_GITNEXUS_EXIT ?? 0));
}
if (command === "context") {
  const wanted = process.env.FAKE_GITNEXUS_REPO;
  if (wanted !== undefined && args[args.indexOf("--repo") + 1] !== wanted) {
    process.exit(1);
  }
  process.stdout.write(process.env.FAKE_GITNEXUS_CONTEXT ?? "");
  process.exit(0);
}
process.exit(1);
