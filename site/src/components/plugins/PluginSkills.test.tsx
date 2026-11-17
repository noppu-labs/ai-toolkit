import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { catalogSkills } from "@/lib/catalog";
import { skillPath } from "@/lib/site";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { PluginSkills } from "./PluginSkills.tsx";

const skills = catalogSkills(FIXTURE_CATALOG.plugins).filter(
  (skill) => skill.plugin === "laravel",
);
const SECTION_ID = "skills";

describe("PluginSkills", () => {
  it("is a level-2 section named for the plugin, with the given eyebrow", async () => {
    const { container } = await render(
      <PluginSkills
        eyebrow="05 — Skills"
        id={SECTION_ID}
        plugin="laravel"
        skills={skills}
      />,
    );

    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("The laravel skills.");
    expect(container.textContent).toContain("05 — Skills");
  });

  it("puts the id on the section, clear of the sticky header", async () => {
    const { container } = await render(
      <PluginSkills
        eyebrow="05 — Skills"
        id={SECTION_ID}
        plugin="laravel"
        skills={skills}
      />,
    );
    const section = container.querySelector("section");

    expect(section?.id).toBe("skills");
    expect(section?.classList.contains("scroll-mt-header")).toBe(true);
  });

  it("links every skill to its page", async () => {
    await render(
      <PluginSkills
        eyebrow="05 — Skills"
        id={SECTION_ID}
        plugin="laravel"
        skills={skills}
      />,
    );

    expect(skills.length).toBeGreaterThan(0);
    expect(
      page
        .getByRole("link")
        .elements()
        .map((link) => link.getAttribute("href")),
    ).toEqual(skills.map((skill) => skillPath(skill.name)));
  });

  it("spaces the list from the heading like the section's other bodies", async () => {
    const { container } = await render(
      <PluginSkills
        eyebrow="05 — Skills"
        id={SECTION_ID}
        plugin="laravel"
        skills={skills}
      />,
    );
    const list = container.querySelector("ul");

    expect(list?.classList.contains("mt-6")).toBe(true);
    expect(list?.classList.contains("md:mt-8")).toBe(true);
  });
});
