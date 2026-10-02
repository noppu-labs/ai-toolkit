#!/usr/bin/env node
// Stands in for codegraph: `explore` prints FAKE_CODEGRAPH_LINES numbered lines
// and exits with FAKE_CODEGRAPH_EXIT (default 0).
const [command] = process.argv.slice(2);

if (command === "--version") {
  process.stdout.write("codegraph 0.0.0-fake\n");
  process.exit(0);
}
const count = Number(process.env.FAKE_CODEGRAPH_LINES ?? 3);
process.stdout.write(
  Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n"),
);
process.exit(Number(process.env.FAKE_CODEGRAPH_EXIT ?? 0));
