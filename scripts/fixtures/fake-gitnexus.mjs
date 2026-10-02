#!/usr/bin/env node
// Stands in for gitnexus: `list` prints FAKE_GITNEXUS_LIST and exits with
// FAKE_GITNEXUS_EXIT (default 0); `context` prints FAKE_GITNEXUS_CONTEXT.
const [command] = process.argv.slice(2);

if (command === "--version") {
  process.stdout.write("gitnexus 0.0.0-fake\n");
  process.exit(0);
}
if (command === "list") {
  process.stdout.write(process.env.FAKE_GITNEXUS_LIST ?? "");
  process.exit(Number(process.env.FAKE_GITNEXUS_EXIT ?? 0));
}
if (command === "context") {
  process.stdout.write(process.env.FAKE_GITNEXUS_CONTEXT ?? "");
  process.exit(0);
}
process.exit(1);
