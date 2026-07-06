// Build each Jazzer.js target to a self-contained CommonJS bundle (esbuild),
// then run it under jazzer. Transpile-first sidesteps native ESM/TS
// instrumentation. Usage: node scripts/fuzz/run.mjs [maxTotalTimeSeconds]
//
// Bundles are written with a .cjs extension (not .js): the repo's root
// package.json declares "type": "module", so a plain .js file under
// scripts/fuzz/.build/ would still be loaded as ESM and jazzer's CommonJS
// `module.exports.fuzz` target would fail with
// "ReferenceError: module is not defined in ES module scope".
//
// @jazzer.js/core is marked external: bundling it pulls in @babel/core,
// which does a dynamic `require("@babel/preset-typescript/package.json")`
// that esbuild cannot resolve at bundle time. It's safe to leave external
// because jazzer's own process already resolves it from node_modules at
// runtime.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, ".build");
const maxTotalTime = process.argv[2] ?? "30";

const targets = readdirSync(here)
  .filter((f) => f.endsWith(".fuzz.ts"))
  .map((f) => f.replace(/\.ts$/, ""));

mkdirSync(buildDir, { recursive: true });

for (const target of targets) {
  const outfile = join(buildDir, `${target}.cjs`);
  execFileSync(
    "esbuild",
    [
      join(here, `${target}.ts`),
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--external:@jazzer.js/core",
      `--outfile=${outfile}`,
    ],
    { stdio: "inherit" },
  );
  const corpus = join(here, "corpus", target.replace(/\.fuzz$/, ""));
  mkdirSync(corpus, { recursive: true });
  console.log(`\n=== fuzzing ${target} (max ${maxTotalTime}s) ===`);
  execFileSync(
    "npx",
    [
      "jazzer",
      resolve(outfile),
      resolve(corpus),
      "--",
      `-max_total_time=${maxTotalTime}`,
    ],
    { stdio: "inherit" },
  );
}
