import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    setupFiles: ["scripts/fc-setup.ts"],
    // The split review-* test files spawn git and node in parallel, which
    // stretches a 2-3 s test past the 5 s default on a loaded machine.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: [
        "scripts/**/*.ts",
        "review/opencode/**/*.ts",
        "investigate/opencode/**/*.ts",
        "packages/opencode-toolkit-core/**/*.ts",
      ],
      // Helpers moved out of the review-* test files; inside them they were
      // never counted.
      exclude: ["scripts/review-*/helpers.ts"],
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
