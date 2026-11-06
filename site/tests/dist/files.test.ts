import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import { readSyncedPlugins } from "../../scripts/opencode/content.ts";
import { catalogSkills } from "../../src/lib/catalog.ts";
import { opencodePluginPath } from "../../src/lib/opencode.ts";
import { SITE_URL, skillPath } from "../../src/lib/site.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SITE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const DIST = new URL("../../dist/", import.meta.url);
const SKILL_NAMES: string[] = catalogSkills(
  buildCatalog(REPO_ROOT).plugins,
).map((skill) => skill.name);
const OPENCODE_PLUGIN_NAMES: string[] = readSyncedPlugins(SITE_DIR).map(
  (plugin) => plugin.name,
);

function built(file: string): string {
  return readFileSync(new URL(file, DIST), "utf8");
}

/** The URLs a sitemap lists. */
function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, loc]) => loc ?? "");
}

describe("the built site's files", () => {
  it("has a directory page for every skill", () => {
    expect(SKILL_NAMES.length).toBeGreaterThan(0);
    expect(
      SKILL_NAMES.filter(
        (name) => !existsSync(new URL(`skills/${name}/index.html`, DIST)),
      ),
    ).toEqual([]);
  });

  it("lists the home page, every skill's page and every OpenCode plugin's page in the sitemap, none past the root with a trailing slash", () => {
    const urls = locs(built("sitemap-0.xml"));

    expect(OPENCODE_PLUGIN_NAMES.length).toBeGreaterThan(0);
    expect(urls.toSorted()).toEqual(
      [
        `${SITE_URL}/`,
        ...SKILL_NAMES.map((name) => `${SITE_URL}${skillPath(name)}`),
        ...OPENCODE_PLUGIN_NAMES.map(
          (name) => `${SITE_URL}${opencodePluginPath(name)}`,
        ),
      ].toSorted(),
    );
    expect(
      urls.filter((url) => url !== `${SITE_URL}/` && url.endsWith("/")),
    ).toEqual([]);
  });

  it("points the sitemap index at the sitemap", () => {
    expect(locs(built("sitemap-index.xml"))).toEqual([
      `${SITE_URL}/sitemap-0.xml`,
    ]);
  });

  it("redirects the old sitemap URL to the index", () => {
    expect(built("_redirects").trim()).toBe(
      "/sitemap.xml /sitemap-index.xml 301",
    );
  });

  it("has the 404 page, which Cloudflare serves for unknown paths", () => {
    expect(existsSync(new URL("404.html", DIST))).toBe(true);
  });

  it("names the sitemap index in robots.txt", () => {
    expect(built("robots.txt")).toContain(
      `Sitemap: ${SITE_URL}/sitemap-index.xml`,
    );
  });
});
