// Jest is used ONLY to drive Jazzer.js coverage-guided fuzzing via
// @jazzer.js/jest-runner (the officially supported way to run TypeScript fuzz
// targets). Unit/property tests run on vitest, not jest. A single "Jazzer.js"
// project matches scripts/fuzz/*.fuzz.ts.
//
// ts-jest transpiles each target to CommonJS (isolatedModules = transpile-only);
// moduleNameMapper strips the repo's explicit `.ts` import extensions so jest's
// resolver finds the modules. skills-sync.ts is import.meta-free (its CLI
// bootstrap lives in scripts/sync.ts), so it compiles cleanly here.
import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: { name: "Jazzer.js", color: "cyan" },
      testEnvironment: "node",
      testMatch: ["<rootDir>/scripts/fuzz/**/*.fuzz.[jt]s"],
      testRunner: "@jazzer.js/jest-runner",
      transform: {
        "^.+\\.[jt]s$": [
          "ts-jest",
          {
            isolatedModules: true,
            tsconfig: {
              module: "commonjs",
              esModuleInterop: true,
              verbatimModuleSyntax: false,
              allowImportingTsExtensions: false,
            },
          },
        ],
      },
      moduleNameMapper: { "^(\\.{1,2}/.*)\\.ts$": "$1" },
    },
  ],
};

export default config;
