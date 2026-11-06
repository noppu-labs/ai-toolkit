import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  inject,
  it,
} from "vitest";
import { readSyncedPlugins } from "../../scripts/opencode/content.ts";
import { canonicalUrl } from "../../src/lib/head.ts";
import { OPENCODE_PATH, opencodePluginPath } from "../../src/lib/opencode.ts";
import { SITE_URL } from "../../src/lib/site.ts";
import { type OpenedPage, openPage, settle } from "./browser.ts";

const SITE_DIR = fileURLToPath(new URL("../..", import.meta.url));
const PLUGINS = readSyncedPlugins(SITE_DIR);
const REVIEWER = "opencode-permission-reviewer";

/** The file name an island loads its component from, without the build's hash. */
function componentName(url: string | null): string | undefined {
  return url?.split("/").at(-1)?.split(".")[0];
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe.each(PLUGINS)(
  "the page for $name, before any script runs",
  ({ name, manifest }) => {
    const path = opencodePluginPath(name);
    const others = PLUGINS.filter((other) => other.name !== name);
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

    it("is served at its URL", () => {
      expect(opened.response?.status()).toBe(200);
    });

    it("carries the manifest's SEO title and description, canonical to production", async () => {
      const title = `${manifest.seo.title} · AI Toolkit`;
      const canonical = canonicalUrl(path);

      expect(await opened.page.title()).toBe(title);
      expect(await meta("og:title")).toBe(title);
      expect(await meta("description")).toBe(manifest.seo.description);
      expect(await meta("og:description")).toBe(manifest.seo.description);
      expect(await attribute('link[rel="canonical"]', "href")).toBe(canonical);
      expect(await meta("og:url")).toBe(canonical);
    });

    it("shares its own image, a served 1200×600 PNG", async () => {
      const image = (await meta("og:image")) ?? "";

      expect(image.startsWith(`${SITE_URL}/_astro/`)).toBe(true);
      expect(await meta("og:image:type")).toBe("image/png");
      expect(await meta("og:image:width")).toBe("1200");
      expect(await meta("og:image:height")).toBe("600");
      expect(await meta("og:image:alt")).toBe(manifest.image.alt);
      expect(await meta("twitter:image:alt")).toBe(manifest.image.alt);

      const response = await fetch(
        new URL(new URL(image).pathname, inject("baseUrl")),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(pngSize(new Uint8Array(await response.arrayBuffer()))).toEqual({
        width: 1200,
        height: 600,
      });
    });

    it("has one h1, the manifest's title", async () => {
      const headings = opened.page.locator("h1");

      expect(await headings.count()).toBe(1);
      expect(await headings.textContent()).toBe(manifest.title);
    });

    it("describes its breadcrumb as JSON-LD", async () => {
      const scripts = await opened.page
        .locator('script[type="application/ld+json"]')
        .allTextContents();

      expect(scripts).toHaveLength(1);
      const data = JSON.parse(scripts[0] ?? "");
      expect(data["@type"]).toBe("BreadcrumbList");
      expect(data.itemListElement).toHaveLength(3);
      expect(data.itemListElement[2]).toMatchObject({
        position: 3,
        name: manifest.title,
        item: canonicalUrl(path),
      });
    });

    it("has every host's install commands in the HTML, only the first host's shown", async () => {
      const codes = await opened.page.locator("main code").allTextContents();
      const [first, ...rest] = manifest.install.hosts;
      const shown = (commands: readonly string[]): Promise<boolean[]> =>
        Promise.all(
          commands.map((command) =>
            opened.page.getByText(command, { exact: true }).isVisible(),
          ),
        );
      const firstCommands = first?.commands ?? [];
      const restCommands = rest.flatMap((host) => host.commands);

      expect(codes).toEqual(
        expect.arrayContaining([...firstCommands, ...restCommands]),
      );
      expect(firstCommands.length).toBeGreaterThan(0);
      expect(await shown(firstCommands)).toEqual(firstCommands.map(() => true));
      expect(await shown(restCommands)).toEqual(restCommands.map(() => false));
    });

    it("links to the OpenCode hub and to every other plugin's page", async () => {
      const hrefs = await opened.page
        .locator("main a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href")));

      expect(hrefs).toContain(OPENCODE_PATH);
      for (const other of others) {
        expect(hrefs).toContain(opencodePluginPath(other.name));
      }
    });

    it("hydrates the header, the install box and the footer only", async () => {
      const islands = await opened.page
        .locator("astro-island")
        .evaluateAll((elements) =>
          elements.map((island) => island.getAttribute("component-url")),
        );

      expect(islands.map(componentName)).toEqual([
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

  /** Opens `path` of the built site, waits until it has hydrated and settled, and has `afterEach` close it. */
  async function open(path: string): Promise<OpenedPage> {
    const page = await openPage(path);
    opened.push(page);
    // Fail on a missing element well before the test's own timeout.
    page.page.setDefaultTimeout(5000);
    await settle(page.page);
    return page;
  }

  function commandOf(page: Page, command: string): Locator {
    return page.getByText(command, { exact: true });
  }

  it.each(PLUGINS.map(({ name }) => name))(
    "hydrates %s with no console errors",
    async (name) => {
      const { page, errors } = await open(opencodePluginPath(name));

      expect(await page.locator("astro-island[ssr]").count()).toBe(0);
      expect(errors).toEqual([]);
    },
  );

  it("switches the permission reviewer's install box to OpenCode V1", async () => {
    const reviewer = PLUGINS.find(({ name }) => name === REVIEWER);
    const [v2, v1] = reviewer?.manifest.install.hosts ?? [];
    const v2Command = v2?.commands[0] ?? "";
    const v1Command = v1?.commands[0] ?? "";
    expect(v1Command).toMatch(/^bunx /);
    const { page, errors } = await open(opencodePluginPath(REVIEWER));

    await page.getByRole("tab", { name: "OpenCode V1" }).click();

    await expect.poll(() => commandOf(page, v1Command).isVisible()).toBe(true);
    expect(await commandOf(page, v2Command).isVisible()).toBe(false);
    expect(
      await page
        .getByRole("tab", { name: "OpenCode V1" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(errors).toEqual([]);
  });
});
