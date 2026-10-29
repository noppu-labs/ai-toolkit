import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { type CatalogSkill, catalogSkills } from "./lib/catalog.ts";
import { SkillPage } from "./SkillPage.tsx";
import { FIXTURE_CATALOG } from "./test/fixture-catalog.ts";

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

describe("SkillPage", () => {
  it("names the skill in the page's only h1", async () => {
    render(
      <SkillPage siblings={[enums]} skill={dtos}>
        <p>body</p>
      </SkillPage>,
    );

    await expect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("laravel-dtos");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });

  it("leads back to the catalog and the plugin's skills", async () => {
    render(
      <SkillPage siblings={[enums]} skill={dtos}>
        <p>body</p>
      </SkillPage>,
    );

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

  it("holds its children in the skill's article, under the plugin and name", async () => {
    render(
      <SkillPage siblings={[enums]} skill={dtos}>
        <p>body</p>
      </SkillPage>,
    );

    const article = page.getByRole("article", { name: "laravel-dtos" });
    await expect
      .element(article.getByText("laravel", { exact: true }))
      .toBeVisible();
    await expect.element(article.getByText("body")).toBeVisible();
  });

  it("links the plugin's other skills to their pages", async () => {
    render(
      <SkillPage siblings={[enums]} skill={dtos}>
        <p>body</p>
      </SkillPage>,
    );

    await expect
      .element(page.getByRole("heading", { name: "More laravel skills" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("link", { name: /^laravel-enums/ }))
      .toHaveAttribute("href", "/skills/laravel-enums");
  });

  it("lists no other skills when the plugin has none", async () => {
    render(
      <SkillPage siblings={[]} skill={dtos}>
        <p>body</p>
      </SkillPage>,
    );

    await expect.element(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect
      .element(page.getByRole("heading", { name: /^More .* skills$/ }))
      .not.toBeInTheDocument();
  });
});
