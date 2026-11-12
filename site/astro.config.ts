import { fileURLToPath, URL } from "node:url";
import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { rehypeSkillBody } from "./scripts/rehype-skill-body.ts";
import { REPO_URL } from "./src/lib/repo.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  site: "https://toolkit.noppu.com",
  trailingSlash: "never",
  build: { format: "directory" },
  markdown: {
    processor: unified({
      rehypePlugins: [[rehypeSkillBody, { repoRoot, repoUrl: REPO_URL }]],
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
