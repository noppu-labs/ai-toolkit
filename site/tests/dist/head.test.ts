import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ABOVE_THE_FOLD_FONTS } from "../../src/lib/font-files.ts";
import { THEME_COLORS } from "../../src/lib/head.ts";
import { HOME_HEAD } from "../../src/lib/pages.ts";
import { SITE_URL } from "../../src/lib/site.ts";
import { type OpenedPage, openPage } from "./browser.ts";

const DIST = new URL("../../dist/", import.meta.url);
const NO_FLASH = readFileSync(
  new URL("../../src/scripts/no-flash.js", import.meta.url),
  "utf8",
);

let opened: OpenedPage;

beforeAll(async () => {
  opened = await openPage("/", { javaScript: false });
});

afterAll(async () => {
  await opened.close();
});

/**
 * The attribute of the one element `selector` matches, or `null` at once when none does.
 * Two matches fail the test (Playwright's strict mode).
 */
async function attribute(
  selector: string,
  name: string,
): Promise<string | null> {
  const element = opened.page.locator(selector);
  return (await element.count()) === 0 ? null : element.getAttribute(name);
}

/** The meta with this `property` or `name`. */
function meta(key: string): Promise<string | null> {
  return attribute(`meta[property="${key}"], meta[name="${key}"]`, "content");
}

describe("the home page's sharing tags", () => {
  it("carries the home page's title and description", async () => {
    expect(await opened.page.title()).toBe(HOME_HEAD.title);
    expect(await meta("og:title")).toBe(HOME_HEAD.title);
    expect(await meta("description")).toBe(HOME_HEAD.description);
    expect(await meta("og:description")).toBe(HOME_HEAD.description);
  });

  it("points the canonical link and og:url at the site root", async () => {
    expect(await attribute('link[rel="canonical"]', "href")).toBe(
      `${SITE_URL}/`,
    );
    expect(await meta("og:url")).toBe(`${SITE_URL}/`);
  });

  it("shares the 1200×630 social card", async () => {
    expect(await meta("og:image")).toBe(`${SITE_URL}/og-image.png`);
    expect(await meta("og:image:type")).toBe("image/png");
    expect(await meta("og:image:width")).toBe("1200");
    expect(await meta("og:image:height")).toBe("630");
    expect(await meta("og:image:alt")).toMatch(/\S/);
    expect(await meta("og:site_name")).toMatch(/AI Toolkit/);
  });

  it("gives X the large card and the image's alt text, leaving the rest to the Open Graph tags", async () => {
    expect(await meta("twitter:card")).toBe("summary_large_image");
    expect(await meta("twitter:image:alt")).toBe(await meta("og:image:alt"));
    const fallbacks = ["twitter:title", "twitter:description", "twitter:image"];
    expect(await Promise.all(fallbacks.map(meta))).toEqual([null, null, null]);
  });

  it("serves the social card from public/", async () => {
    const response = await fetch(new URL("/og-image.png", inject("baseUrl")));

    expect(response.ok).toBe(true);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

describe("the home page's theme", () => {
  it("gives the browser chrome the light and the dark theme colour", async () => {
    const themeColors = await opened.page
      .locator('meta[name="theme-color"]')
      .evaluateAll((metas) =>
        metas.map((meta) => ({
          media: meta.getAttribute("media"),
          content: meta.getAttribute("content"),
        })),
      );

    expect(themeColors).toEqual([
      { media: "(prefers-color-scheme: light)", content: THEME_COLORS.light },
      { media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark },
    ]);
  });

  it("inlines the no-flash script once, after the theme-color metas it reads", async () => {
    const head = await opened.page.locator("head > *").evaluateAll((elements) =>
      elements.map((element) => ({
        themeColor: element.matches('meta[name="theme-color"]'),
        inlineScript: element.matches("script:not([src])"),
        text: element.textContent?.trim(),
      })),
    );
    const scripts = head.filter((element) => element.inlineScript);

    expect(scripts.map((script) => script.text)).toEqual([NO_FLASH.trim()]);
    expect(head.findLastIndex((element) => element.themeColor)).toBeLessThan(
      head.findIndex((element) => element.inlineScript),
    );
  });
});

describe("the home page's font preloads", () => {
  /** The built stylesheets, which name each font file they load. */
  function stylesheets(): string[] {
    return readdirSync(new URL("_astro/", DIST))
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(new URL(`_astro/${file}`, DIST), "utf8"));
  }

  it.each(ABOVE_THE_FOLD_FONTS)(
    "preloads the built %s, the file the stylesheet loads",
    async (font) => {
      const stem = font.replace(/\.woff2$/, "");
      const links = await opened.page
        .locator("link[rel=preload]")
        .evaluateAll((elements) =>
          elements.map((link) => ({
            href: link.getAttribute("href") ?? "",
            as: link.getAttribute("as"),
            type: link.getAttribute("type"),
            cors: link.hasAttribute("crossorigin"),
          })),
        );
      const preloads = links.filter((link) =>
        link.href.split("/").at(-1)?.startsWith(stem),
      );

      expect(preloads).toEqual([
        {
          href: expect.any(String),
          as: "font",
          type: "font/woff2",
          cors: true,
        },
      ]);
      const [{ href } = { href: "" }] = preloads;
      expect(existsSync(new URL(`.${href}`, DIST))).toBe(true);
      expect(stylesheets().some((sheet) => sheet.includes(href))).toBe(true);
    },
  );
});
