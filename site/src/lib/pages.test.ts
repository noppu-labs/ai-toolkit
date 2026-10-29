import { describe, expect, it } from "vitest";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { type CatalogSkill, catalogSkills } from "./catalog.ts";
import {
  HOME_HEAD,
  pageAt,
  pageHead,
  type SitePage,
  sitePages,
} from "./pages.ts";

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

describe("sitePages", () => {
  it("lists the home page, then a page per skill in catalog order", () => {
    const pages = sitePages(skills);

    expect(pages[0]).toEqual({ kind: "home" });
    expect(
      pages.slice(1).map((page) => (page.kind === "skill" ? page.skill : null)),
    ).toEqual(skills);
  });

  it("gives each skill page the plugin's other skills", () => {
    const pages = sitePages(skills);
    const siblingsOf = (skill: CatalogSkill): CatalogSkill[] | undefined =>
      pages.find(
        (page): page is Extract<SitePage, { kind: "skill" }> =>
          page.kind === "skill" && page.skill === skill,
      )?.siblings;

    expect(siblingsOf(dtos)).toEqual([enums]);
    expect(siblingsOf(shadcn)).toEqual([]);
  });
});

describe("pageHead", () => {
  it("gives the home page the title and description index.html carries", () => {
    expect(pageHead({ kind: "home" })).toEqual(HOME_HEAD);
    expect(HOME_HEAD.path).toBe("/");
  });

  it("names the skill and its plugin on a skill page", () => {
    expect(pageHead({ kind: "skill", skill: dtos, siblings: [enums] })).toEqual(
      {
        title: "laravel-dtos — Claude Code skill · AI Toolkit",
        description: `${dtos.summary} A Claude Code skill in the laravel plugin of AI Toolkit.`,
        path: "/skills/laravel-dtos/",
      },
    );
  });
});

describe("pageAt", () => {
  it("is the home page at the root", () => {
    expect(pageAt("/", skills)).toEqual({ kind: "home" });
  });

  it.each(["/skills/laravel-dtos/", "/skills/laravel-dtos"])(
    "is the skill's page at %s",
    (pathname) => {
      expect(pageAt(pathname, skills)).toEqual({
        kind: "skill",
        skill: dtos,
        siblings: [enums],
      });
    },
  );

  it.each(["/skills/nope/", "/skills/%E0%A4%A/", "/other/"])(
    "falls back to the home page at %s",
    (pathname) => {
      expect(pageAt(pathname, skills)).toEqual({ kind: "home" });
    },
  );
});
