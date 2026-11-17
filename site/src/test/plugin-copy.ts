import type { PluginPageCopy } from "../lib/plugin-page-schema.ts";

/** A valid manifest for the fixture catalog's `laravel` plugin. */
export const FIXTURE_PLUGIN_COPY: PluginPageCopy = {
  schemaVersion: 1,
  title: "Laravel conventions for Claude",
  seo: {
    title: "Laravel plugin for Claude Code",
    description:
      "Skills that teach Claude Code your Laravel conventions: DTOs, enums, models, policies, services, validation and tests, in one install.",
  },
  tagline:
    "Laravel skills that keep generated code in line with how your team writes it.",
  highlights: {
    heading: "What the plugin gives Claude",
    items: [
      {
        label: "DTOs",
        title: "Typed data objects",
        body: "Claude reaches for data objects instead of loose arrays.",
      },
      {
        label: "Enums",
        title: "Backed enums everywhere",
        body: "Statuses and types become enums with labels and helpers.",
      },
      {
        label: "Tests",
        title: "Tests in your style",
        body: "New code arrives with tests that follow your conventions.",
      },
    ],
  },
  howItWorks: {
    heading: "How it works",
    steps: [
      "Install the plugin from the marketplace once.",
      "Claude loads the matching skill when your task touches that area.",
    ],
  },
  requirements: { items: ["Claude Code", "A Laravel project"] },
  faq: [
    {
      q: "Does it change my code?",
      a: "No. The skills only guide what Claude writes for you.",
    },
    {
      q: "Which Laravel versions work?",
      a: "Any version your project already runs; the skills describe conventions.",
    },
    {
      q: "Can I use only some skills?",
      a: "Yes. Claude loads a skill only when the task calls for it.",
    },
  ],
  links: [
    {
      label: "Source on GitHub",
      href: "https://github.com/noppu-labs/ai-toolkit",
    },
  ],
};
