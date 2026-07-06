import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
      exclude: ["scripts/**/*.test.ts", "scripts/fuzz/**"],
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
