import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import { catalogSkills } from "../../src/lib/catalog.ts";
import { canonicalUrl } from "../../src/lib/head.ts";
import { pageHead, skillPages } from "../../src/lib/pages.ts";
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

    it("carries the head that pageHead names for it", async () => {
      const canonical = canonicalUrl(head.path);

      expect(await opened.page.title()).toBe(head.title);
      expect(await meta("og:title")).toBe(head.title);
      expect(await meta("description")).toBe(head.description);
      expect(await meta("og:description")).toBe(head.description);
      expect(await attribute('link[rel="canonical"]', "href")).toBe(canonical);
      expect(await meta("og:url")).toBe(canonical);
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

    it("hydrates the header, the skill's detail and the footer only", async () => {
      const islands = await opened.page
        .locator("astro-island")
        .evaluateAll((elements) =>
          elements.map((island) => island.getAttribute("component-url")),
        );

      expect(islands.map(componentName)).toEqual([
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

  it("has no horizontal scroll on a phone", async () => {
    const { page, errors } = await open("/skills/deep", PHONE);

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
