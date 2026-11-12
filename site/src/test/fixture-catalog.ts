import type { Catalog, PluginEntry } from "../catalog-types.ts";

export const FIXTURE_CATALOG: Catalog = {
  marketplaceName: "ai-toolkit",
  marketplaceDescription: "Test marketplace description",
  plugins: [
    {
      name: "laravel",
      description: "Laravel backend skills",
      version: "0.1.3",
      agentCount: 1,
      ruleCount: 4,
      skills: [
        {
          name: "laravel-dtos",
          description: "Data Transfer Objects using Spatie Laravel Data.",
          path: "laravel/skills/laravel-dtos/SKILL.md",
          sourceUrl:
            "https://github.com/noppu-labs/ai-toolkit/blob/main/laravel/skills/laravel-dtos/SKILL.md",
        },
        {
          name: "laravel-enums",
          description: "Backed enums with labels and helpers.",
          path: "laravel/skills/laravel-enums/SKILL.md",
          sourceUrl:
            "https://github.com/noppu-labs/ai-toolkit/blob/main/laravel/skills/laravel-enums/SKILL.md",
        },
      ],
    },
    {
      name: "inertia-react",
      description: "Inertia + React frontend skills",
      version: "0.1.2",
      agentCount: 1,
      ruleCount: 2,
      skills: [
        {
          name: "shadcn",
          description: "Component composition rules for shadcn/ui.",
          path: "inertia-react/skills/shadcn/SKILL.md",
          sourceUrl:
            "https://github.com/noppu-labs/ai-toolkit/blob/main/inertia-react/skills/shadcn/SKILL.md",
        },
      ],
    },
  ],
};

/** Not in `FIXTURE_CATALOG`: tests that need the site's plugin order or the "any language" chip add it themselves. */
export const FIXTURE_REVIEW_PLUGIN: PluginEntry = {
  name: "review",
  description: "Code review skills for any language",
  version: "0.8.1",
  agentCount: 0,
  ruleCount: 0,
  opencodePackage: "@noppu-labs/opencode-review",
  skills: [
    {
      name: "comment-audit",
      description: "Give every comment a branch adds a verdict.",
      path: "review/skills/comment-audit/SKILL.md",
      sourceUrl:
        "https://github.com/noppu-labs/ai-toolkit/blob/main/review/skills/comment-audit/SKILL.md",
    },
  ],
};
