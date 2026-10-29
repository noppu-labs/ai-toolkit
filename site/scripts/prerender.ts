#!/usr/bin/env -S npx tsx
/**
 * Writes the prerendered site into `dist/`: the home page over the built `index.html`,
 * `skills/<name>.html` per skill, and `sitemap.xml`. Runs after `vite build` and
 * the SSR build of `src/entry-server.tsx` (see the `build` script). Fails loudly when
 * `index.html` no longer carries the home page's head, rather than shipping it on every page.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HOME_HEAD, type PrerenderedPage } from "../src/lib/pages.ts";
import { SITE_URL } from "../src/lib/site.ts";
import { isMainModule } from "./main-module.ts";

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

interface Swap {
  needle: string;
  /** How often `index.html` carries the needle. */
  expected: number;
  replacement: string;
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

/** The home page's head values in `index.html`, and the page's to put in their place. */
function headSwaps({ head, html }: PrerenderedPage): Swap[] {
  const e = escapeHtml;
  return [
    {
      needle: `<title>${e(HOME_HEAD.title)}</title>`,
      expected: 1,
      replacement: `<title>${e(head.title)}</title>`,
    },
    {
      needle: `content="${e(HOME_HEAD.title)}"`,
      expected: 1,
      replacement: `content="${e(head.title)}"`,
    },
    {
      needle: `content="${e(HOME_HEAD.description)}"`,
      expected: 2,
      replacement: `content="${e(head.description)}"`,
    },
    {
      needle: `href="${SITE_URL}/"`,
      expected: 1,
      replacement: `href="${SITE_URL}${head.path}"`,
    },
    {
      needle: `content="${SITE_URL}/"`,
      expected: 1,
      replacement: `content="${SITE_URL}${head.path}"`,
    },
    // Last, so the page's own text can never change a head count.
    {
      needle: '<div id="root"></div>',
      expected: 1,
      replacement: `<div id="root">${html}</div>`,
    },
  ];
}

/** `template` with the page's head and markup in place of the home page's. */
export function pageDocument(template: string, page: PrerenderedPage): string {
  const swaps = headSwaps(page);
  for (const { needle, expected } of swaps) {
    const found = occurrences(template, needle);
    if (found !== expected) {
      throw new Error(
        `prerender: index.html has ${found} of ${needle}, expected ${expected}`,
      );
    }
  }
  // split/join rather than replace, which would expand `$&` in the page's text.
  return swaps.reduce(
    (document, { needle, replacement }) =>
      document.split(needle).join(replacement),
    template,
  );
}

/**
 * The file under `dist/` that serves a page's path: `/skills/x` → `skills/x.html`. Cloudflare
 * serves `x.html` at `/skills/x`, and redirects `/skills/x/` and `/skills/x.html` there.
 * It reads `index.html` as its folder's page and `404.html` as its folder's not-found page,
 * so a page cannot take either name.
 */
export function outputFile(path: string): string {
  if (path === "/") {
    return "index.html";
  }
  const segments = path.split("/").slice(1);
  const name = segments.at(-1);
  if (
    !/^(?:\/[^/]+)+$/.test(path) ||
    segments.some((segment) => segment === "." || segment === "..") ||
    name === "index" ||
    name === "404"
  ) {
    throw new Error(`prerender: cannot write a page at "${path}"`);
  }
  return `${path.slice(1)}.html`;
}

export function sitemapXml(paths: readonly string[]): string {
  const urls = paths.map(
    (path) =>
      `  <url>\n    <loc>${escapeHtml(`${SITE_URL}${path}`)}</loc>\n  </url>\n`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("")}</urlset>\n`;
}

/** Reads the built `index.html` once, before the home page is written over it. */
export function writeSite(
  distDir: string,
  pages: readonly PrerenderedPage[],
): void {
  const template = readFileSync(join(distDir, "index.html"), "utf8");
  for (const page of pages) {
    const file = join(distDir, outputFile(page.head.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, pageDocument(template, page));
  }
  writeFileSync(
    join(distDir, "sitemap.xml"),
    sitemapXml(pages.map((page) => page.head.path)),
  );
}

if (isMainModule(import.meta.url)) {
  const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const server: typeof import("../src/entry-server.tsx") = await import(
    pathToFileURL(join(siteDir, "dist-server", "entry-server.js")).href
  );
  const pages = server.prerenderPages();
  writeSite(join(siteDir, "dist"), pages);
  console.log(`prerendered ${pages.length} pages`);
}
