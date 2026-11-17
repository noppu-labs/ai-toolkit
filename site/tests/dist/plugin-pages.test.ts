import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import { readPluginCopy } from "../../scripts/plugin-copy.ts";
import { catalogSkills } from "../../src/lib/catalog.ts";
import { canonicalUrl, SOCIAL_CARD } from "../../src/lib/head.ts";
import { pluginInstallHosts } from "../../src/lib/install-methods.ts";
import { pluginHead } from "../../src/lib/pages.ts";
import { joinPluginPages } from "../../src/lib/plugin-pages.ts";
import { pluginPath, skillPath } from "../../src/lib/site.ts";
import { type OpenedPage, openPage, settle } from "./browser.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SITE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const CATALOG = buildCatalog(REPO_ROOT);
const PAGES = joinPluginPages(
  CATALOG.plugins,
  readPluginCopy(SITE_DIR).map(({ name, copy }) => ({ id: name, data: copy })),
);

/** The console error Chromium logs for the 404 status of the page's own document. */
const NOT_FOUND_LOG =
  "error: Failed to load resource: the server responded with a status of 404 (Not Found)";

/** The file name an island loads its component from, without the build's hash. */
function componentName(url: string | null): string | undefined {
  return url?.split("/").at(-1)?.split(".")[0];
}

describe.each(PAGES)(
  "the page for $plugin.name, before any script runs",
  (page) => {
    const { plugin, copy } = page;
    const path = pluginPath(plugin.name);
    const head = pluginHead(page);
    const skills = catalogSkills(CATALOG.plugins).filter(
      (skill) => skill.plugin === plugin.name,
    );
    const others = PAGES.filter((other) => other.plugin.name !== plugin.name);
    const hosts = pluginInstallHosts(plugin);
    let opened: OpenedPage;

    beforeAll(async () => {
      opened = await openPage(path, { javaScript: false });
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
      key: string,
    ): Promise<string | null> {
      const element = opened.page.locator(selector);
      return (await element.count()) === 0 ? null : element.getAttribute(key);
    }

    /** The meta with this `property` or `name`. */
    function meta(key: string): Promise<string | null> {
      return attribute(
        `meta[property="${key}"], meta[name="${key}"]`,
        "content",
      );
    }

    function hrefsOf(selector: string): Promise<(string | null)[]> {
      return opened.page
        .locator(selector)
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    }

    it("is served with status 200", () => {
      expect(opened.response?.status()).toBe(200);
    });

    it("carries the head that pluginHead names for it", async () => {
      const canonical = canonicalUrl(path);

      expect(await opened.page.title()).toBe(head.title);
      expect(await meta("og:title")).toBe(head.title);
      expect(await meta("description")).toBe(head.description);
      expect(await meta("og:description")).toBe(head.description);
      expect(await attribute('link[rel="canonical"]', "href")).toBe(canonical);
      expect(await meta("og:url")).toBe(canonical);
      expect(canonical).toMatch(/\/plugins\/[^/]+$/);
    });

    it("describes its breadcrumb as JSON-LD", async () => {
      const scripts = await opened.page
        .locator('script[type="application/ld+json"]')
        .allTextContents();

      expect(scripts).toHaveLength(1);
      const data = JSON.parse(scripts[0] ?? "");
      expect(data["@type"]).toBe("BreadcrumbList");
      expect(data.itemListElement).toHaveLength(2);
      expect(data.itemListElement[0]).toMatchObject({
        position: 1,
        name: "Home",
        item: canonicalUrl("/"),
      });
      expect(data.itemListElement[1]).toMatchObject({
        position: 2,
        name: plugin.name,
        item: canonicalUrl(path),
      });
    });

    it("has one h1, the copy's title", async () => {
      const headings = opened.page.locator("h1");

      expect(await headings.count()).toBe(1);
      expect(await headings.textContent()).toBe(copy.title);
    });

    it("has one element with the skills id, the section that holds the skills heading", async () => {
      const section = opened.page.locator('[id="skills"]');

      expect(await section.count()).toBe(1);
      expect(
        await section
          .getByRole("heading", {
            level: 2,
            name: `The ${plugin.name} skills.`,
          })
          .count(),
      ).toBe(1);
    });

    it("shares the site's social card", async () => {
      expect(await meta("og:image")).toBe(SOCIAL_CARD.url);
    });

    it("has every host's commands in the install box, only the first host's shown", async () => {
      const [first, ...rest] = hosts;
      const inBox = (command: string): Locator =>
        opened.page.locator("astro-island").getByText(command, { exact: true });
      const shown = (commands: readonly string[]): Promise<boolean[]> =>
        Promise.all(commands.map((command) => inBox(command).isVisible()));

      if (first === undefined) {
        throw new Error(`${plugin.name} has no install host`);
      }

      const firstCommands = first.commands;
      const restCommands = rest.flatMap((host) => host.commands);
      const allCommands = [...firstCommands, ...restCommands];
      const counts = await Promise.all(
        allCommands.map((command) => inBox(command).count()),
      );

      // isVisible() is false for a missing element too, so first check that each is there.
      expect(
        allCommands.filter((_command, index) => counts[index] === 0),
      ).toEqual([]);
      expect(firstCommands.length).toBeGreaterThan(0);
      expect(await shown(firstCommands)).toEqual(firstCommands.map(() => true));
      expect(await shown(restCommands)).toEqual(restCommands.map(() => false));
    });

    it("names a tab per host, and links npm only when the plugin has a package", async () => {
      const tabs = await opened.page.getByRole("tab").allTextContents();
      const npm = opened.page.getByRole("link", { name: /^npm/ });

      expect(tabs).toEqual(hosts.map((host) => host.label));
      expect(await npm.count()).toBe(
        plugin.opencodePackage === undefined ? 0 : 1,
      );
    });

    it("links every skill's page, every other plugin's page and the plugin list", async () => {
      const hrefs = await hrefsOf("main a");

      for (const skill of skills) {
        expect(hrefs).toContain(skillPath(skill.name));
      }
      for (const other of others) {
        expect(hrefs).toContain(pluginPath(other.plugin.name));
      }
      expect(hrefs).toContain("/#plugins");
    });

    it("links the plugin list from its breadcrumb", async () => {
      expect(await hrefsOf('nav[aria-label="Breadcrumb"] a')).toEqual([
        "/#plugins",
      ]);
    });

    it("sends the header's section links to the home page", async () => {
      expect(await hrefsOf('header a[href*="#"]')).toEqual([
        "/#install",
        "/#plugins",
        "/#skills",
        "/#security",
      ]);
    });

    it("hydrates the header, the install box, the footer and the consent banner only", async () => {
      const islands = await opened.page
        .locator("astro-island")
        .evaluateAll((elements) =>
          elements.map((island) => island.getAttribute("component-url")),
        );

      expect(islands.map(componentName)).toEqual([
        "ConsentBanner",
        "HeaderIsland",
        "InstallBox",
        "Footer",
      ]);
      expect(await opened.page.locator("astro-island h1").count()).toBe(0);
    });
  },
);

describe("a plugin page with scripts", () => {
  const opened: OpenedPage[] = [];

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((page) => page.close()));
  });

  /** Opens `path` of the built site and has `afterEach` close it. */
  async function open(
    path: string,
    { settled = true }: { settled?: boolean } = {},
  ): Promise<OpenedPage> {
    const page = await openPage(path);
    opened.push(page);
    // Fail on a missing element well before the test's own timeout.
    page.page.setDefaultTimeout(5000);
    if (settled) {
      await settle(page.page);
    }
    return page;
  }

  /** The command in the install box; the page's copy may quote it too. */
  function commandOf(page: Page, command: string): Locator {
    return page.locator("astro-island").getByText(command, { exact: true });
  }

  it("hydrates /plugins/review with no console errors, and its OpenCode tab shows the OpenCode commands", async () => {
    const review = PAGES.find(({ plugin }) => plugin.name === "review");
    if (review === undefined) {
      throw new Error("no page for review");
    }

    const hosts = pluginInstallHosts(review.plugin);
    const claudeCommand = hosts.find(({ label }) => label !== "OpenCode")
      ?.commands[0];
    const opencodeCommand = hosts.find(({ label }) => label === "OpenCode")
      ?.commands[0];
    if (claudeCommand === undefined || opencodeCommand === undefined) {
      throw new Error("review has no Claude Code or no OpenCode command");
    }

    expect(opencodeCommand).toMatch(/^opencode plugin add /);
    const { page, errors } = await open(pluginPath("review"));

    expect(await page.locator("astro-island[ssr]").count()).toBe(0);

    await page.getByRole("tab", { name: "OpenCode" }).click();

    await expect
      .poll(() => commandOf(page, opencodeCommand).isVisible())
      .toBe(true);
    // Base UI leaves both panels unhidden for a moment after the click.
    await expect
      .poll(() => commandOf(page, claudeCommand).isVisible())
      .toBe(false);
    expect(errors).toEqual([]);
  });

  it("answers a mistyped plugin URL with the 404 page, never the home page", async () => {
    const { page, response, errors } = await open("/plugins/nope", {
      settled: false,
    });

    expect(response?.status()).toBe(404);
    expect(await page.locator("h1").allTextContents()).toEqual([
      "This page wandered off",
    ]);
    // Only the browser's report of that 404 itself; any other entry fails.
    expect(errors).toEqual([NOT_FOUND_LOG]);
  });
});
