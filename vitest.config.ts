import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    setupFiles: ["scripts/fc-setup.ts"],
    coverage: {
      provider: "v8",
      // Test files are excluded by vitest's default coverage.exclude, same as
      // partner-portal; a custom exclude here would replace those defaults.
      include: ["scripts/**/*.ts"],
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
