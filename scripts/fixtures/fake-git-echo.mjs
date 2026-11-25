#!/usr/bin/env node
// Stands in for a git too old to know a rev-parse option: such a git prints
// the option back and exits 0. This one prints its last argument.
process.stdout.write(`${process.argv.at(-1)}\n`);
