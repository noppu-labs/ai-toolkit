import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    setupFiles: ["scripts/fc-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
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
