import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCatalog } from "../../scripts/build-catalog.ts";
import { skillPath } from "../../src/lib/site.ts";
import { type OpenedPage, openPage } from "./browser.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

let opened: OpenedPage;

beforeAll(async () => {
  opened = await openPage("/", { javaScript: false });
});

afterAll(async () => {
  await opened.close();
});

/** The file name an island loads its component from, without the build's hash. */
function componentName(url: string | null): string | undefined {
  return url?.split("/").at(-1)?.split(".")[0];
}

describe("the home page, before any script runs", () => {
  it("has one h1, the hero's", async () => {
    const headings = opened.page.locator("h1");

    expect(await headings.count()).toBe(1);
    expect(await headings.textContent()).toBe(
      "Agent skills for deep code review and grounded investigation.",
    );
  });

  it("lays the sections out in the header's order", async () => {
    const ids = await opened.page
      .locator("#install, #plugins, #skills, #security")
      .evaluateAll((sections) => sections.map((section) => section.id));

    expect(ids).toEqual(["install", "plugins", "skills", "security"]);
  });

  it("links every skill's page once", async () => {
    const hrefs = await opened.page
      .locator('a[href^="/skills/"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    const skills = buildCatalog(REPO_ROOT).plugins.flatMap((plugin) =>
      plugin.skills.map((skill) => skillPath(skill.name)),
    );

    expect(skills.length).toBeGreaterThan(0);
    expect(hrefs.toSorted()).toEqual(skills.toSorted());
  });

  it("hydrates the interactive sections only, leaving the hero static", async () => {
    const islands = await opened.page
      .locator("astro-island")
      .evaluateAll((elements) =>
        elements.map((island) => island.getAttribute("component-url")),
      );

    expect(islands.map(componentName)).toEqual([
      "HeaderIsland",
      "InstallSection",
      "PluginCards",
      "CatalogIsland",
      "SecuritySection",
      "Footer",
    ]);
    expect(await opened.page.locator("astro-island h1").count()).toBe(0);
  });

  it("renders the whole frame inside #root, Base UI's isolation root", async () => {
    const root = opened.page.locator("#root");
    const frame = ['a[href="#main"]', "header", "main#main", "footer"];

    expect(
      await Promise.all(frame.map((part) => root.locator(part).count())),
    ).toEqual([1, 1, 1, 1]);
    expect(
      await opened.page.locator("body > :not(#root, script, style)").count(),
    ).toBe(0);
  });
});
