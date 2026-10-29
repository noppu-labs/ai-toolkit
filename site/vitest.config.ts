import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Measured by `npm run coverage:worker`: the Worker runs in production, so
    // it is held to the same thresholds as the root scripts.
    coverage: {
      provider: "v8",
      include: ["worker/**/*.ts"],
      exclude: ["worker/**/*.test.ts"],
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["scripts/**/*.test.ts", "worker/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          setupFiles: ["src/css/app.css"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          // The built site, served by `astro preview` and driven by Playwright:
          // `npm run build` first.
          name: "dist",
          environment: "node",
          include: ["tests/dist/**/*.test.ts"],
          globalSetup: ["tests/dist/global-setup.ts"],
          // Vitest 5.0.5 crashes printing an error thrown by a global setup
          // loaded from this cache (`code.charCodeAt is not a function`), which
          // would hide the setup's "run npm run build" message.
          fsModuleCache: false,
          testTimeout: 30000,
        },
      },
    ],
  },
});
