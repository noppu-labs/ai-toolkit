import { fileURLToPath, URL } from "node:url";
import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { skillBodyPlugin } from "./scripts/skill-body-plugin.ts";
import { REPO_URL } from "./src/lib/repo.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  site: "https://toolkit.noppu.com",
  trailingSlash: "never",
  build: { format: "directory" },
  markdown: {
    processor: satteri({
      hastPlugins: [skillBodyPlugin({ repoRoot, repoUrl: REPO_URL })],
    }),
  },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
