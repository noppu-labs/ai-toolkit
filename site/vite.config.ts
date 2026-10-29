import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import { preloadFonts } from "./scripts/preload-fonts.ts";

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss(), preloadFonts()],
  // The SSR bundle only feeds scripts/prerender.ts, so it needs no copy of public/.
  build: { copyPublicDir: !isSsrBuild },
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
    ],
  },
}));
