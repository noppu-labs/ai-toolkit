import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import { afterEach, describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import type { PluginEntry } from "../../src/catalog-types.ts";
import {
  type CatalogSkill,
  catalogSkills,
  groupSkills,
} from "../../src/lib/catalog.ts";
import { pluginInstallCommand } from "../../src/lib/install-methods.ts";
import { PLUGIN_ORDER, sortPlugins } from "../../src/lib/plugins.ts";
import {
  type OpenedPage,
  type OpenPageOptions,
  openPage,
  pastTheRightEdge,
} from "./browser.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PLUGINS: PluginEntry[] = buildCatalog(REPO_ROOT).plugins;
const SKILLS: CatalogSkill[] = catalogSkills(PLUGINS);

const DESKTOP = { width: 1440, height: 900 } as const;
const PHONE = { width: 390, height: 844 } as const;

/** `SkillsCatalog`'s `COLLAPSED_ROWS.phone`: the rows a long group shows on a phone before "Show more". */
const PHONE_ROWS = 4;

/** The preferences store's entry for a visitor who chose the skills CLI. */
const SKILLS_CLI_SAVED = {
  "ai-toolkit-preferences":
    '{"state":{"installMethod":"skills-cli"},"version":1}',
} as const;

const opened: OpenedPage[] = [];

afterEach(async () => {
  await Promise.all(opened.splice(0).map((page) => page.close()));
});

/**
 * Waits until the main thread has gone idle twice. Astro drops an island's `ssr`
 * attribute as soon as React starts hydrating it, so this is what lets each
 * hydration render, its effects and the re-render with the browser's values
 * (and any error they log) finish.
 */
function settle(page: Page): Promise<void> {
  return page.evaluate(async (): Promise<void> => {
    const idle = (): Promise<void> =>
      new Promise((resolve) => {
        requestIdleCallback(() => resolve());
      });
    await idle();
    await idle();
  });
}

/** Waits until Astro has handed the catalog island to React, which hydrates it next. */
async function catalogHydrating(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector(
        'astro-island[component-export="CatalogIsland"]:not([ssr])',
      ) !== null,
  );
}

/** Waits until Astro has handed every island to React. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelector("astro-island[ssr]") === null,
  );
}

/** Has `afterEach` close the page. */
function track(page: OpenedPage): OpenedPage {
  opened.push(page);
  // Fail on a missing element well before the test's own timeout.
  page.page.setDefaultTimeout(5000);
  return page;
}

/** Opens `path` of the built site and waits until it has hydrated and settled. */
async function open(
  path: string,
  options: OpenPageOptions = {},
): Promise<OpenedPage> {
  const page = track(await openPage(path, options));
  await settle(page.page);
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

/** Whether any of the element lies inside the viewport's width. */
function onScreen(element: Locator): Promise<boolean> {
  return element.evaluate((node: Element): boolean => {
    const { left, right } = node.getBoundingClientRect();
    return right > 0 && left < window.innerWidth;
  });
}

function isFocused(element: Locator): Promise<boolean> {
  return element.evaluate(
    (node: Element): boolean => node === document.activeElement,
  );
}

/** The first skill a phone hides until its group's "Show more", by the catalog's own grouping. */
function pastThePhoneFold(): string {
  const groups = groupSkills(
    SKILLS,
    sortPlugins(PLUGINS).map((plugin) => plugin.name),
    { collapseAt: PHONE_ROWS, expanded: new Set(), pinned: null },
  );
  const collapsed = groups.find(
    (group) => group.shown.length < group.skills.length,
  );
  const skill = collapsed?.skills[collapsed.shown.length];
  if (skill === undefined) {
    throw new Error("No group of the catalog collapses on a phone");
  }
  return skill.name;
}

function skillsLink(page: Page, plugin: string): Locator {
  return page.getByRole("link", {
    name: new RegExp(`^See \\d+ ${plugin} skills$`),
  });
}

describe.each([DESKTOP, PHONE])(
  "the home page hydrating at $width × $height",
  (viewport) => {
    it("hydrates the bare page", async () => {
      const { errors } = await open("/", viewport);

      expect(errors).toEqual([]);
    });

    it("hydrates a deep link to a skill", async () => {
      const { page, errors } = await open("/?skill=deep#skills", viewport);

      // The desktop pane's title, or the phone sheet's.
      expect(
        await page
          .getByRole("heading", { name: "deep", exact: true })
          .isVisible(),
      ).toBe(true);
      expect(errors).toEqual([]);
    });

    it("hydrates a filtered catalog", async () => {
      const { page, errors } = await open("/?q=review#skills", viewport);

      expect(
        await page
          .getByRole("searchbox", { name: "Filter skills" })
          .inputValue(),
      ).toBe("review");
      expect(errors).toEqual([]);
    });

    it("hydrates the dark theme", async () => {
      const { page, errors } = await open("/", {
        ...viewport,
        colorScheme: "dark",
      });
      const toggle = page.getByRole("button", {
        name: "Switch to light theme",
      });

      expect(
        await page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        ),
      ).toBe(true);
      expect(await toggle.locator("svg.lucide-sun").count()).toBe(1);
      expect(errors).toEqual([]);
    });

    it("hydrates a saved install method", async () => {
      const { page, errors } = await open("/", {
        ...viewport,
        storage: SKILLS_CLI_SAVED,
      });
      const copyLabels = await page
        .locator("#install")
        .getByRole("button", { name: /^Copy / })
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-label")),
        );

      expect(copyLabels).toEqual(
        PLUGIN_ORDER.map(
          (plugin) => `Copy ${pluginInstallCommand(plugin, "skills-cli")}`,
        ),
      );
      expect(errors).toEqual([]);
    });
  },
);

describe("the home page", () => {
  it("offers a skip link to the main content, shown when focused", async () => {
    const { page, errors } = await open("/");
    const skip = page.getByRole("link", { name: "Skip to content" });

    expect(await skip.getAttribute("href")).toBe("#main");
    expect(await page.getByRole("main").getAttribute("id")).toBe("main");
    expect(await onScreen(skip)).toBe(false);

    await page.keyboard.press("Tab");

    expect(await isFocused(skip)).toBe(true);
    expect(await onScreen(skip)).toBe(true);
    expect(errors).toEqual([]);
  });

  it.each([false, true])(
    "scrolls to the URL's section once rendered (reduced motion: %s)",
    async (reducedMotion) => {
      const { page, errors } = await open("/#security", { reducedMotion });

      // A smooth scroll down the whole page takes well over a second.
      await expect
        .poll(async () => Math.abs(await belowHeader(page, "#security")), {
          timeout: 5000,
        })
        .toBeLessThanOrEqual(2);
      expect(errors).toEqual([]);
    },
  );

  it("lands a section's heading just below the sticky header", async () => {
    const { page, errors } = await open("/#plugins", {
      ...PHONE,
      reducedMotion: true,
    });
    const header = page.getByRole("banner");
    const heading = page.getByRole("heading", {
      name: "Review anywhere. Go deep on your stack.",
    });

    await expect
      .poll(async () => Math.abs(await belowHeader(page, "#plugins")))
      .toBeLessThanOrEqual(2);
    const headerBottom = (await header.boundingBox())?.y ?? Number.NaN;
    const headingTop = (await heading.boundingBox())?.y ?? Number.NaN;
    expect(headingTop).toBeGreaterThan(headerBottom);
    expect(errors).toEqual([]);
  });

  it("opens the catalog on a plugin from a card's skills link", async () => {
    const { page, errors } = await open("/", { reducedMotion: true });

    await skillsLink(page, "laravel").click();

    const catalog = page.getByRole("region", { name: "The whole catalog." });
    await expect.poll(() => isFocused(catalog)).toBe(true);
    expect(
      await catalog
        .getByRole("group", { name: "Filter by plugin" })
        .getByRole("button", { name: /^laravel \d+ skills$/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(new URL(page.url()).searchParams.get("plugin")).toBe("laravel");
    expect(errors).toEqual([]);
  });

  it("clears a typed catalog filter when a card's skills link is followed", async () => {
    const { page, errors } = await open("/", { reducedMotion: true });
    const search = page.getByRole("searchbox", { name: "Filter skills" });
    const empty = page.getByText("No skills match your filter.");

    await search.fill("zzz-no-such-skill");
    await empty.waitFor();
    // A DOM click: Playwright's would scroll the link under the sticky header.
    await skillsLink(page, "laravel").dispatchEvent("click");

    await expect.poll(() => search.inputValue()).toBe("");
    await expect.poll(() => empty.count()).toBe(0);
    expect(errors).toEqual([]);
  });

  it("selects a deep-linked skill and still scrolls to the catalog", async () => {
    const investigate = SKILLS.filter(
      (skill) => skill.plugin === "investigate",
    );
    const place = investigate.findIndex((skill) => skill.name === "deep") + 1;
    const { page, errors } = await open(
      "/?skill=deep&plugin=investigate#skills",
      { width: 1280, height: 900, reducedMotion: true },
    );

    await expect
      .poll(async () => Math.abs(await belowHeader(page, "#skills")))
      .toBeLessThanOrEqual(2);
    expect(
      await page
        .getByRole("link", { name: /^deep\b/ })
        .getAttribute("aria-current"),
    ).toBe("true");
    expect(
      await page
        .getByRole("complementary", { name: "Skill details" })
        .textContent(),
    ).toContain(`investigate${place} of ${investigate.length}`);
    expect(errors).toEqual([]);
  });

  it("has no horizontal scroll on a phone", async () => {
    const { page, errors } = await open("/", { width: 360, height: 740 });

    expect(await page.getByRole("main").isVisible()).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
    // The frame clips sideways overflow instead of scrolling it.
    expect(await pastTheRightEdge(page)).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("returns focus to a phone deep link's row past the fold", async () => {
    const skill = pastThePhoneFold();
    const { page, errors } = await open(`/?skill=${skill}#skills`, PHONE);
    const sheet = page.getByRole("dialog", { name: skill });
    await sheet.waitFor();
    // The fragment's late scroll leaves focus in the modal sheet.
    expect(
      await page.evaluate(
        () => document.activeElement?.closest("[role=dialog]") != null,
      ),
    ).toBe(true);

    await page.keyboard.press("Escape");

    await sheet.waitFor({ state: "detached" });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.getAttribute("data-skill-row") ?? null,
        ),
      )
      .toBe(skill);
    expect(errors).toEqual([]);
  });

  it("dims the header under the phone sheet", async () => {
    const { page, errors } = await open("/?skill=deep#skills", PHONE);
    await page.getByRole("dialog", { name: "deep" }).waitFor();

    const covered = await page.evaluate((): boolean => {
      const header = document.querySelector("header");
      if (header === null) {
        return false;
      }
      const { left, top, width, height } = header.getBoundingClientRect();
      const hit = document.elementFromPoint(left + width / 2, top + height / 2);
      return hit !== null && !header.contains(hit);
    });

    expect(covered).toBe(true);
    expect(errors).toEqual([]);
  });

  it("lands a fragment after late islands hydrate", async () => {
    const { page, errors } = await open("/#skills", {
      reducedMotion: true,
      storage: SKILLS_CLI_SAVED,
    });

    expect(Math.abs(await belowHeader(page, "#skills"))).toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  it("leaves focus where the visitor put it while a fragment waits to land", async () => {
    const { page, errors } = track(
      await openPage("/#skills", {
        storage: SKILLS_CLI_SAVED,
        waitForHydration: false,
      }),
    );
    const search = page.getByRole("searchbox", { name: "Filter skills" });

    await catalogHydrating(page);
    await search.focus();
    await hydrated(page);
    await settle(page);

    expect(await isFocused(search)).toBe(true);
    expect(errors).toEqual([]);
  });

  it("leaves the page where the visitor scrolled it while a fragment waits to land", async () => {
    // The footer's script is held until the visitor has scrolled, so the
    // fragment's late scroll, which waits for every island, is still pending.
    const footer = Promise.withResolvers<void>();
    let held = false;
    const { page, errors } = track(
      await openPage("/#skills", {
        reducedMotion: true,
        waitForHydration: false,
        beforeLoad: async (opening: Page): Promise<void> => {
          await opening.route("**/_astro/Footer.*.js", async (route) => {
            held = true;
            await footer.promise;
            await route.continue();
          });
        },
      }),
    );

    // The desktop pane appears on the catalog's first render with the
    // browser's values, so the catalog's effects have run by then.
    await page.getByRole("complementary", { name: "Skill details" }).waitFor();
    await page.mouse.wheel(0, -600);
    footer.resolve();
    await hydrated(page);
    await settle(page);

    expect(held).toBe(true);
    expect(await belowHeader(page, "#skills")).toBeGreaterThan(300);
    expect(errors).toEqual([]);
  });

  it("works when localStorage throws", async () => {
    const { page, errors } = await open("/", {
      storageBlocked: true,
      colorScheme: "dark",
    });

    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  it("hydrates every island within 2 seconds of load", async () => {
    // `openPage` returns once the `load` event has fired.
    const { page, errors } = track(
      await openPage("/", { waitForHydration: false }),
    );

    await page.waitForFunction(
      () => document.querySelector("astro-island[ssr]") === null,
      undefined,
      { timeout: 2000 },
    );
    await settle(page);
    expect(errors).toEqual([]);
  });
});
