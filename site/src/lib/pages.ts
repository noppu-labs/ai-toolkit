import type { CatalogSkill } from "./catalog.ts";
import { skillPath } from "./site.ts";

/** What a page's `<head>` names; `Base.astro` writes it into the title, description and social tags. */
export interface PageHead {
  title: string;
  description: string;
  /** Root-relative, with no trailing slash past the root: `/` or `/skills/<name>`. */
  path: string;
}

export type SitePage =
  | { kind: "home" }
  | {
      kind: "skill";
      skill: CatalogSkill;
      /** The plugin's other skills, in catalog order. */
      siblings: CatalogSkill[];
    };

/** The home page's head; `tests/dist/head.test.ts` checks the built page against it. */
export const HOME_HEAD: PageHead = {
  title: "Agent skills for Claude Code, OpenCode and more · AI Toolkit",
  description:
    "Deep code review and grounded investigation in PHP, TypeScript, Python and beyond, plus Laravel and React packs. For Claude Code, OpenCode and other agents.",
  path: "/",
};

/** A page per skill, in the given order, each with the plugin's other skills in catalog order. */
export function skillPages(
  skills: readonly CatalogSkill[],
): { skill: CatalogSkill; siblings: CatalogSkill[] }[] {
  return skills.map((skill) => ({
    skill,
    siblings: skills.filter(
      (other) => other.plugin === skill.plugin && other !== skill,
    ),
  }));
}

export function pageHead(page: SitePage): PageHead {
  if (page.kind === "home") {
    return HOME_HEAD;
  }
  const { skill } = page;
  return {
    title: `${skill.name} agent skill · AI Toolkit`,
    description: `${skill.summary} Part of AI Toolkit's ${skill.plugin} plugin for Claude Code, OpenCode and other agents.`,
    path: skillPath(skill.name),
  };
}
