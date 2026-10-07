import { describe, expect, it } from "vitest";
import type { PluginEntry } from "../catalog-types.ts";
import {
  ALL_PLUGINS,
  type CatalogSkill,
  catalogSkills,
  findSkill,
  groupSkills,
  inPlugin,
  matchesQuery,
} from "./catalog.ts";

function plugin(name: string, skills: string[]): PluginEntry {
  return {
    name,
    description: "",
    version: "1.0.0",
    agentCount: 0,
    ruleCount: 0,
    skills: skills.map((skill) => ({
      name: skill,
      description: `About ${skill}. More detail.`,
      sourceUrl: `https://example.com/${skill}`,
    })),
  };
}

const PLUGINS = [
  plugin("laravel", ["laravel-dtos", "a1", "a2", "a3", "a4", "a5", "a6"]),
  plugin("review", ["comment-audit", "pr-review"]),
];

const skills = catalogSkills(PLUGINS);

function names(list: readonly CatalogSkill[]): string[] {
  return list.map((skill) => skill.name);
}

describe("catalogSkills", () => {
  it("orders plugins and skills as the site does, with summaries", () => {
    expect(names(skills)).toEqual([
      "pr-review",
      "comment-audit",
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "a6",
      "laravel-dtos",
    ]);
    expect(skills[0]?.summary).toMatch(/^Reviews a PR/);
    expect(skills.find((skill) => skill.name === "a1")?.summary).toBe(
      "About a1.",
    );
  });
});

describe("matchesQuery and inPlugin", () => {
  it("matches the name, summary or description, ignoring case and outer spaces", () => {
    const dtos = findSkill(skills, "laravel-dtos");
    expect(dtos).not.toBeNull();
    if (dtos === null) {
      return;
    }
    expect(matchesQuery(dtos, " SPATIE ")).toBe(true);
    expect(matchesQuery(dtos, "more detail")).toBe(true);
    expect(matchesQuery(dtos, "enum")).toBe(false);
    expect(inPlugin(dtos, ALL_PLUGINS)).toBe(true);
    expect(inPlugin(dtos, "review")).toBe(false);
  });
});

describe("findSkill", () => {
  it("finds a skill by name, and returns null for an unknown one", () => {
    expect(findSkill(skills, "laravel-dtos")?.plugin).toBe("laravel");
    expect(findSkill(skills, "nope")).toBeNull();
  });
});

describe("groupSkills", () => {
  const order = ["review", "laravel", "empty"];

  it("groups by the plugin order and drops empty groups", () => {
    const groups = groupSkills(skills, order, {
      collapseAt: null,
      expanded: new Set(),
      pinned: null,
    });
    expect(groups.map((group) => group.plugin)).toEqual(["review", "laravel"]);
    expect(groups[1]?.shown).toHaveLength(7);
  });

  it("collapses a group longer than the limit by more than one row", () => {
    const [, laravel] = groupSkills(skills, order, {
      collapseAt: 4,
      expanded: new Set(),
      pinned: null,
    });
    expect(names(laravel?.shown ?? [])).toEqual(["a1", "a2", "a3", "a4"]);
    expect(laravel?.skills).toHaveLength(7);
  });

  it("shows a group just one row over the limit in full", () => {
    const [, laravel] = groupSkills(skills, order, {
      collapseAt: 6,
      expanded: new Set(),
      pinned: null,
    });
    expect(laravel?.shown).toHaveLength(7);
  });

  it("opens an expanded group, or one whose pinned skill is past the fold", () => {
    const options = { collapseAt: 4, pinned: null };
    expect(
      groupSkills(skills, order, {
        ...options,
        expanded: new Set(["laravel"]),
      })[1]?.shown,
    ).toHaveLength(7);
    const pinned = findSkill(skills, "a6");
    expect(
      groupSkills(skills, order, { ...options, expanded: new Set(), pinned })[1]
        ?.shown,
    ).toHaveLength(7);
  });
});
