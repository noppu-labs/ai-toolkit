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

describe("PluginSkills", () => {
  it("is a level-2 section named for the plugin, with the given eyebrow", async () => {
    const { container } = await render(
      <PluginSkills eyebrow="05 — Skills" plugin="laravel" skills={skills} />,
    );

    await expect
      .element(page.getByRole("heading", { level: 2 }))
      .toHaveTextContent("The laravel skills.");
    expect(container.textContent).toContain("05 — Skills");
  });

  it("links every skill to its page", async () => {
    await render(
      <PluginSkills eyebrow="05 — Skills" plugin="laravel" skills={skills} />,
    );

    expect(skills.length).toBeGreaterThan(0);
    expect(
      page
        .getByRole("link")
        .elements()
        .map((link) => link.getAttribute("href")),
    ).toEqual(skills.map((skill) => skillPath(skill.name)));
  });
});
