import { describe, expect, it } from "vitest";
import { FIXTURE_CATALOG } from "@/test/fixture-catalog";
import { CACHE_MANAGER_PLUGIN } from "@/test/opencode-plugins";
import { type CatalogSkill, catalogSkills } from "./catalog.ts";
import type { SocialImage } from "./head.ts";
import { opencodePluginHead, pageHead, skillPages } from "./pages.ts";

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

describe("opencodePluginHead", () => {
  const image: SocialImage = {
    url: "https://toolkit.noppu.com/_astro/social-preview.png",
    type: "image/png",
    width: 1200,
    height: 600,
    alt: "The cache manager's card",
  };

  it("takes the manifest's SEO title and description, the page's path and the image", () => {
    const head = opencodePluginHead(CACHE_MANAGER_PLUGIN, image);

    expect(head).toMatchObject({
      title: `${CACHE_MANAGER_PLUGIN.page.seo.title} · AI Toolkit`,
      description: CACHE_MANAGER_PLUGIN.page.seo.description,
      path: "/opencode/opencode-cache-manager",
      image,
    });
  });

  it("carries the Home › OpenCode › title breadcrumb as JSON-LD", () => {
    const { jsonLd } = opencodePluginHead(CACHE_MANAGER_PLUGIN, image);
    const items: { name: string; item: string }[] = JSON.parse(
      jsonLd ?? "{}",
    ).itemListElement;

    expect(items.map(({ name, item }) => [name, item])).toEqual([
      ["Home", "https://toolkit.noppu.com/"],
      ["OpenCode", "https://toolkit.noppu.com/opencode"],
      [
        CACHE_MANAGER_PLUGIN.page.title,
        "https://toolkit.noppu.com/opencode/opencode-cache-manager",
      ],
    ]);
  });
});
