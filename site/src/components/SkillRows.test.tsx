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

  it("applies the given className to the list", async () => {
    const { container } = await render(
      <SkillRows className="mt-4 md:mt-5" skills={skills} />,
    );
    const list = container.querySelector("ul");

    expect(list?.classList.contains("mt-4")).toBe(true);
    expect(list?.classList.contains("md:mt-5")).toBe(true);
  });

  it("sets no top margin of its own", async () => {
    const { container } = await render(<SkillRows skills={skills} />);
    const list = container.querySelector("ul");

    expect(list?.classList.contains("mt-4")).toBe(false);
    expect(list?.classList.contains("md:mt-5")).toBe(false);
  });

  it("shows each skill's summary", async () => {
    const { container } = await render(<SkillRows skills={skills} />);

    for (const skill of skills) {
      expect(container.textContent).toContain(skill.summary);
    }
  });
});
