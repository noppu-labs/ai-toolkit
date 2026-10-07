import { describe, expect, it } from "vitest";
import catalog from "../generated/catalog.json";
import {
  firstSentence,
  SKILL_SUMMARIES,
  type SkillSummaries,
  skillSummary,
} from "./skill-summaries.ts";

const catalogKeys: string[] = catalog.plugins.flatMap((plugin) =>
  plugin.skills.map((skill) => `${plugin.name}/${skill.name}`),
);

const summaryKeys: string[] = Object.entries(SKILL_SUMMARIES).flatMap(
  ([plugin, skills]) =>
    Object.keys(skills).map((skill) => `${plugin}/${skill}`),
);

describe("locales/en/skills.json", () => {
  it("has a summary for every skill in the catalog", () => {
    const missing = catalogKeys.filter((key) => !summaryKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("has no summary for a skill the catalog does not have", () => {
    const orphans = summaryKeys.filter((key) => !catalogKeys.includes(key));
    expect(orphans).toEqual([]);
  });

  it("keeps every summary to one plain, non-empty line", () => {
    const summaries = Object.values(SKILL_SUMMARIES).flatMap((skills) =>
      Object.values(skills),
    );
    for (const summary of summaries) {
      expect(summary.trim()).not.toBe("");
      expect(summary).not.toMatch(/\n/);
    }
  });
});

describe("firstSentence", () => {
  it.each([
    ["Thin controllers. Use when creating them.", "Thin controllers."],
    ["Is it typed? Check the diff.", "Is it typed?"],
    ["Uses PHP 8.x patterns. Use when reviewing.", "Uses PHP 8.x patterns."],
    ["  No full stop at all  ", "No full stop at all"],
  ])("cuts %j to %j", (text, expected) => {
    expect(firstSentence(text)).toBe(expected);
  });
});

describe("skillSummary", () => {
  const source: SkillSummaries = { review: { "pr-review": "Reviews a PR." } };

  it("uses the locale summary when there is one", () => {
    expect(
      skillSummary(
        "review",
        { name: "pr-review", description: "Orchestrate a review. Use when…" },
        source,
      ),
    ).toBe("Reviews a PR.");
  });

  it("falls back to the first sentence of the SKILL.md description", () => {
    expect(
      skillSummary(
        "review",
        { name: "new-skill", description: "Does a new thing. Use when…" },
        source,
      ),
    ).toBe("Does a new thing.");
    expect(
      skillSummary(
        "unknown",
        { name: "x", description: "Plugin not in the file. More." },
        source,
      ),
    ).toBe("Plugin not in the file.");
  });
});
