import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type CatalogSkill, catalogSkills } from "./lib/catalog.ts";
import { SkillPage } from "./SkillPage.tsx";
import { FIXTURE_CATALOG } from "./test/fixture-catalog.ts";
import { resetPreferences } from "./test/preferences.ts";

const skills = catalogSkills(FIXTURE_CATALOG.plugins);

function skillNamed(name: string): CatalogSkill {
  const found = skills.find((skill) => skill.name === name);
  if (found === undefined) {
    throw new Error(`no fixture skill ${name}`);
  }
  return found;
}

const dtos = skillNamed("laravel-dtos");
const enums = skillNamed("laravel-enums");

beforeEach(async () => {
  // The header's inline nav shows from `md`.
  await page.viewport(1280, 800);
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
});

describe("SkillPage", () => {
  it("names the skill in the page's only h1", async () => {
    render(<SkillPage siblings={[enums]} skill={dtos} />);

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("laravel-dtos");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("leads back to the catalog and the plugin's skills", async () => {
    render(<SkillPage siblings={[enums]} skill={dtos} />);

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect
      .element(crumbs.getByRole("link", { name: "Skills" }))
      .toHaveAttribute("href", "/#skills");
    await expect
      .element(crumbs.getByRole("link", { name: "laravel" }))
      .toHaveAttribute("href", "/?plugin=laravel#skills");
    await expect
      .element(crumbs.getByText("laravel-dtos"))
      .toHaveAttribute("aria-current", "page");
  });

  it("shows what the skill does, how it is invoked and how to install it", async () => {
    render(<SkillPage siblings={[enums]} skill={dtos} />);

    const main = page.getByRole("main");
    await expect.element(main.getByText(dtos.summary)).toBeVisible();
    await expect.element(main.getByText("laravel:laravel-dtos")).toBeVisible();
    await expect.element(main.getByText(dtos.description)).toBeVisible();
    await expect
      .element(main.getByText("/plugin install laravel@ai-toolkit"))
      .toBeVisible();
  });

  it("links the plugin's other skills to their pages", async () => {
    render(<SkillPage siblings={[enums]} skill={dtos} />);

    await expect
      .element(page.getByRole("heading", { name: "More laravel skills" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("link", { name: /^laravel-enums/ }))
      .toHaveAttribute("href", "/skills/laravel-enums");
  });

  it("lists no other skills when the plugin has none", async () => {
    render(<SkillPage siblings={[]} skill={dtos} />);

    await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: /^More .* skills$/ }))
      .not.toBeInTheDocument();
  });

  it("links the header to the home page's sections", async () => {
    render(<SkillPage siblings={[enums]} skill={dtos} />);

    await expect
      .element(
        page
          .getByRole("navigation", { name: "Main" })
          .getByRole("link", { name: "Install", exact: true }),
      )
      .toHaveAttribute("href", "/#install");
  });
});
