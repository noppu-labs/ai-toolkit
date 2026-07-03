import type { Catalog } from "../catalog-types.ts";

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
          sourceUrl:
            "https://github.com/noppu-labs/ai-toolkit/blob/main/laravel/skills/laravel-dtos/SKILL.md",
        },
        {
          name: "laravel-enums",
          description: "Backed enums with labels and helpers.",
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
          sourceUrl:
            "https://github.com/noppu-labs/ai-toolkit/blob/main/inertia-react/skills/shadcn/SKILL.md",
        },
      ],
    },
  ],
};
