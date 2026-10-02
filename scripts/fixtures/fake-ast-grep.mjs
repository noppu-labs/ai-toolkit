#!/usr/bin/env node
// Stands in for ast-grep: one container hit for the resolve() pattern, nothing
// for the others, or an error on every pattern under FAKE_AST_GREP_FAIL=1.
const args = process.argv.slice(2);

if (args.includes("--version")) {
  process.stdout.write("ast-grep 0.0.0-fake\n");
  process.exit(0);
}
if (process.env.FAKE_AST_GREP_FAIL === "1") {
  process.stderr.write("ERROR: fake pattern failure\n");
  process.exit(2);
}
if (args[args.indexOf("--pattern") + 1] === "resolve($C::class)") {
  process.stdout.write("app/Jobs/Run.php:3:$x = resolve(Invoice::class);\n");
  process.exit(0);
}
process.exit(1);
