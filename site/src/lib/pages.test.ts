import { describe, expect, it } from "vitest";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { type CatalogSkill, catalogSkills } from "./catalog.ts";
import { pageHead, skillPages } from "./pages.ts";

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
const shadcn = skillNamed("shadcn");

describe("skillPages", () => {
  it("lists a page per skill in the given order", () => {
    expect(skillPages(skills).map((page) => page.skill)).toEqual(skills);
  });

  it("gives each skill page the plugin's other skills", () => {
    const pages = skillPages(skills);
    const siblingsOf = (skill: CatalogSkill): CatalogSkill[] | undefined =>
      pages.find((page) => page.skill === skill)?.siblings;

    expect(siblingsOf(dtos)).toEqual([enums]);
    expect(siblingsOf(shadcn)).toEqual([]);
  });
});

describe("pageHead", () => {
  it("names the skill and its plugin on a skill page", () => {
    expect(pageHead({ kind: "skill", skill: dtos, siblings: [enums] })).toEqual(
      {
        title: "laravel-dtos agent skill · AI Toolkit",
        description: `${dtos.summary} Part of AI Toolkit's laravel plugin for Claude Code, OpenCode and other agents.`,
        path: "/skills/laravel-dtos",
      },
    );
  });
});
