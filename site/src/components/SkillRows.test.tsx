import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { catalogSkills } from "@/lib/catalog";
import { skillPath } from "@/lib/site";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { SkillRows } from "./SkillRows.tsx";

const skills = catalogSkills(FIXTURE_CATALOG.plugins).slice(0, 2);

describe("SkillRows", () => {
  it("links each skill by name to the skill's page", async () => {
    await render(<SkillRows skills={skills} />);

    const links = page.getByRole("link").elements();
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      skills.map((skill) => skillPath(skill.name)),
    );
    expect(links.map((link) => link.textContent)).toEqual(
      skills.map((skill) => `${skill.name}${skill.summary}`),
    );
  });

  it("shows each skill's summary", async () => {
    const { container } = await render(<SkillRows skills={skills} />);

    for (const skill of skills) {
      expect(container.textContent).toContain(skill.summary);
    }
  });
});
