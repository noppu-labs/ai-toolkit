import { fileURLToPath, URL } from "node:url";
import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import sitemap, { type SitemapItem } from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { buildCatalog } from "./scripts/build-catalog.ts";
import { skillBodyPlugin } from "./scripts/skill-body-plugin.ts";
import { skillLastModified } from "./scripts/skill-last-modified.ts";
import { REPO_URL } from "./src/lib/repo.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const lastModified = skillLastModified(
  repoRoot,
  buildCatalog(repoRoot).plugins.flatMap((plugin) => plugin.skills),
);

if (lastModified.size === 0) {
  console.warn(
    "sitemap: no git history (shallow clone?), so skill pages get no lastmod",
  );
}

export default defineConfig({
  site: "https://toolkit.noppu.com",
  trailingSlash: "never",
  build: { format: "directory" },
  markdown: {
    processor: satteri({
      hastPlugins: [skillBodyPlugin({ repoRoot, repoUrl: REPO_URL })],
    }),
  },
  integrations: [
    react(),
    sitemap({
      serialize: (item: SitemapItem): SitemapItem => {
        const lastmod = lastModified.get(item.url);

        return lastmod === undefined ? item : { ...item, lastmod };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
