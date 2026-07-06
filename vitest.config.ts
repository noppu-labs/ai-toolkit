import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    setupFiles: ["scripts/fc-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["scripts/**/*.ts"],
      exclude: [
        "scripts/**/*.test.ts",
        "scripts/**/test-helpers.ts",
        "scripts/fc-setup.ts",
      ],
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
