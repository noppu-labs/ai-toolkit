import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLUGIN_ORDER, sortSkills } from "../src/lib/plugins.ts";
import { SKILL_SUMMARIES } from "../src/lib/skill-summaries.ts";
import { buildCatalog } from "./build-catalog.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalog = buildCatalog(repoRoot);

const catalogKeys: string[] = catalog.plugins.flatMap((plugin) =>
  plugin.skills.map((skill) => `${plugin.name}/${skill.name}`),
);

const summaryKeys: string[] = Object.entries(SKILL_SUMMARIES).flatMap(
  ([plugin, skills]) =>
    Object.keys(skills).map((skill) => `${plugin}/${skill}`),
);

describe("PLUGIN_ORDER", () => {
  it("names every catalog plugin", () => {
    expect([...PLUGIN_ORDER].sort()).toEqual(
      catalog.plugins.map((plugin) => plugin.name).sort(),
    );
  });
});

describe("sortSkills", () => {
  it("puts pr-review first in the real catalog", () => {
    const review = catalog.plugins.find((p) => p.name === "review");
    expect(sortSkills("review", review?.skills ?? [])[0]?.name).toBe(
      "pr-review",
    );
  });
});

describe("locales/en/skills.json", () => {
  it("has a summary for every skill in the catalog", () => {
    const missing = catalogKeys.filter((key) => !summaryKeys.includes(key));
    expect(missing).toEqual([]);
  });

  it("has no summary for a skill the catalog does not have", () => {
    const orphans = summaryKeys.filter((key) => !catalogKeys.includes(key));
    expect(orphans).toEqual([]);
  });
});
