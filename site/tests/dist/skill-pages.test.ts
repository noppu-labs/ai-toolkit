import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import { catalogSkills } from "../../src/lib/catalog.ts";
import { canonicalUrl } from "../../src/lib/head.ts";
import { pageHead, skillPages } from "../../src/lib/pages.ts";
import { REPO_URL } from "../../src/lib/repo.ts";
import { skillPath } from "../../src/lib/site.ts";
import { pluginSkillsHref } from "../../src/lib/url-state.ts";
import {
  type OpenedPage,
  type OpenPageOptions,
  openPage,
  pastTheRightEdge,
} from "./browser.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PAGES = skillPages(catalogSkills(buildCatalog(REPO_ROOT).plugins));

const PHONE = { width: 390, height: 844 } as const;

/** The console error Chromium logs for the 404 status of the page's own document. */
const NOT_FOUND_LOG =
  "error: Failed to load resource: the server responded with a status of 404 (Not Found)";

/** The first markdown heading of a SKILL.md outside code fences, as the page prints its text, with its level. */
function firstHeading(path: string): { level: number; text: string } {
  let fenced = false;

  for (const line of readFileSync(`${REPO_ROOT}${path}`, "utf8").split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
    }

    const match = fenced ? null : /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);

    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { level: match[1].length, text: match[2].replaceAll("`", "") };
    }
  }

  throw new Error(`no heading in ${path}`);
}

/** The file name an island loads its component from, without the build's hash. */
function componentName(url: string | null): string | undefined {
  return url?.split("/").at(-1)?.split(".")[0];
}

describe.each(PAGES)(
  "the page for $skill.name, before any script runs",
  ({ skill, siblings }) => {
    const head = pageHead({ kind: "skill", skill, siblings });
    let opened: OpenedPage;

    beforeAll(async () => {
      opened = await openPage(skillPath(skill.name), { javaScript: false });
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
      return attribute(
        `meta[property="${key}"], meta[name="${key}"]`,
        "content",
      );
    }

    it("has one h1, the skill's name", async () => {
      const headings = opened.page.locator("h1");

      expect(await headings.count()).toBe(1);
      expect(await headings.textContent()).toBe(skill.name);
    });

    it("shows the skill's SKILL.md under 'How <name> works'", async () => {
      const heading = opened.page.getByRole("heading", {
        level: 2,
        name: `How ${skill.name} works`,
      });
      const expected = firstHeading(skill.path);
      const first = opened.page
        .locator("section", { has: heading })
        .locator("h3, h4, h5, h6")
        .first();

      expect(await heading.count()).toBe(1);
      expect(await first.evaluate((node) => node.tagName)).toBe(
        `H${Math.min(expected.level + 2, 6)}`,
      );
      expect((await first.textContent())?.trim()).toBe(expected.text);
    });

    it("carries the head that pageHead names for it", async () => {
      const canonical = canonicalUrl(head.path);

      expect(await opened.page.title()).toBe(head.title);
      expect(await meta("og:title")).toBe(head.title);
      expect(await meta("description")).toBe(head.description);
      expect(await meta("og:description")).toBe(head.description);
      expect(await attribute('link[rel="canonical"]', "href")).toBe(canonical);
      expect(await meta("og:url")).toBe(canonical);
      expect(
        await opened.page
          .locator('script[type="application/ld+json"]')
          .textContent(),
      ).toBe(head.jsonLd);
    });

    it("canonicalises to a URL with no trailing slash and no .html", async () => {
      const canonical = await attribute('link[rel="canonical"]', "href");

      expect(canonical).toMatch(/\/skills\/[^/]+$/);
      expect(canonical).not.toMatch(/\.html$/);
    });

    it("links back to the catalog and to the plugin's skills", async () => {
      const hrefs = await opened.page
        .locator('nav[aria-label="Breadcrumb"] a')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

      expect(hrefs).toEqual(["/#skills", `/${pluginSkillsHref(skill.plugin)}`]);
    });

    it("links the plugin's other skills, in catalog order", async () => {
      const hrefs = await opened.page
        .locator('main a[href^="/skills/"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

      expect(hrefs).toEqual(siblings.map((other) => skillPath(other.name)));
    });

    it("does not link to itself as 'Read the full skill'", async () => {
      const links = opened.page.locator('a:has-text("Read the full skill")');

      expect(await links.count()).toBe(0);
    });

    it("sends the header's section links to the home page", async () => {
      const hrefs = await opened.page
        .locator('header a[href*="#"]')
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

      expect(hrefs).toEqual([
        "/#install",
        "/#plugins",
        "/#skills",
        "/#security",
      ]);
    });

    it("hydrates the header, the skill's detail, the footer and the consent banner only", async () => {
      const islands = await opened.page
        .locator("astro-island")
        .evaluateAll((elements) =>
          elements.map((island) => island.getAttribute("component-url")),
        );

      expect(islands.map(componentName)).toEqual([
        "ConsentBanner",
        "HeaderIsland",
        "SkillDetail",
        "Footer",
      ]);
      expect(await opened.page.locator("astro-island h1").count()).toBe(0);
    });
  },
);

describe("a skill page with scripts", () => {
  const opened: OpenedPage[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((page) => page.close()));
  });

  /** Opens `path` of the built site and has `afterEach` close it. */
  async function open(
    path: string,
    options: OpenPageOptions = {},
  ): Promise<OpenedPage> {
    const page = await openPage(path, options);
    opened.push(page);
    // Fail on a missing element well before the test's own timeout.
    page.page.setDefaultTimeout(5000);
    return page;
  }

  /** How far `selector`'s top sits below the sticky header's bottom, in CSS pixels. */
  function belowHeader(page: Page, selector: string): Promise<number> {
    return page.evaluate((target: string): number => {
      const header = document.querySelector("header")?.getBoundingClientRect();
      const element = document.querySelector(target)?.getBoundingClientRect();
      return header === undefined || element === undefined
        ? Number.NaN
        : element.top - header.bottom;
    }, selector);
  }

  it("lands the home page's Install section just below the sticky header", async () => {
    const { page, errors } = await open("/skills/deep", {
      reducedMotion: true,
    });

    await page
      .getByRole("banner")
      .getByRole("link", { name: "Install", exact: true })
      .click();
    await page.waitForURL(
      (url) => url.pathname === "/" && url.hash === "#install",
    );
    await page.waitForFunction(
      () => document.querySelector("astro-island[ssr]") === null,
    );

    // The home page scrolls once its islands have hydrated and the browser is idle.
    await expect
      .poll(async () => Math.abs(await belowHeader(page, "#install")))
      .toBeLessThanOrEqual(2);
    expect(await belowHeader(page, "#install h2")).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  it("lands a SKILL.md heading opened by its fragment just below the sticky header", async () => {
    const { page, errors } = await open("/skills/shadcn#updating-components", {
      width: 1280,
      height: 800,
      reducedMotion: true,
    });

    await expect
      .poll(async () =>
        Math.abs(await belowHeader(page, "#updating-components")),
      )
      .toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  it("keeps every SKILL.md heading clear of the sticky header when a link targets it", async () => {
    const { page } = await open("/skills/laravel-models", {
      javaScript: false,
    });

    const margins = await page.evaluate(() => {
      const header = document.querySelector("header")?.offsetHeight ?? 0;

      return [...document.querySelectorAll(".prose :is(h3, h4, h5, h6)")].map(
        (heading) => ({
          level: heading.tagName,
          short:
            Number.parseFloat(getComputedStyle(heading).scrollMarginTop) <
            header,
        }),
      );
    });

    expect(new Set(margins.map((margin) => margin.level))).toEqual(
      new Set(["H3", "H4", "H5"]),
    );
    expect(margins.filter((margin) => margin.short)).toEqual([]);
  });

  it.each(PAGES.map(({ skill }) => skillPath(skill.name)))(
    "has no horizontal scroll on a phone at %s",
    async (path) => {
      const { page, errors } = await open(path, PHONE);

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      // The frame clips sideways overflow instead of scrolling it.
      expect(await pastTheRightEdge(page)).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  it("sends a SKILL.md's relative links to GitHub", async () => {
    const { page } = await open("/skills/shadcn", { javaScript: false });

    expect(
      await page
        .getByRole("link", { name: "styling.md" })
        .first()
        .getAttribute("href"),
    ).toBe(
      `${REPO_URL}/blob/main/inertia-react/skills/shadcn/rules/styling.md`,
    );
  });

  it("draws a body's blockquote border in the theme's edge colour in dark", async () => {
    const { page } = await open("/skills/shadcn", {
      colorScheme: "dark",
      waitForHydration: true,
    });

    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );

    const colours = await page.evaluate(() => {
      // `--edge` and `--border` hold colours; a probe turns each into its computed value.
      const probe = document.createElement("div");
      document.body.append(probe);
      const resolve = (name: string): string => {
        probe.style.color = `var(${name})`;
        return getComputedStyle(probe).color;
      };
      const quote = document.querySelector(".prose blockquote");

      return {
        quote: quote === null ? null : getComputedStyle(quote).borderLeftColor,
        edge: resolve("--edge"),
        border: resolve("--border"),
      };
    });

    expect(colours.quote).toBe(colours.edge);
    expect(colours.quote).not.toBe(colours.border);
  });

  it("shows HTML inside a SKILL.md's code fences as code", async () => {
    const { page } = await open("/skills/laravel-inertia-react", {
      javaScript: false,
    });

    expect(
      await page
        .locator("pre", { hasText: 'className="container mx-auto py-8"' })
        .count(),
    ).toBeGreaterThan(0);
  });

  it("answers a mistyped skill URL with the 404 page, never the home page", async () => {
    const { page, response, errors } = await open("/skills/not-a-skill");

    expect(response?.status()).toBe(404);
    expect(await page.locator("h1").allTextContents()).toEqual([
      "This page wandered off",
    ]);
    // Only the browser's report of that 404 itself; any other entry fails.
    expect(errors).toEqual([NOT_FOUND_LOG]);
  });
});
