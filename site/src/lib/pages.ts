import { type CatalogSkill, findSkill } from "./catalog.ts";
import { skillPath } from "./site.ts";

/** What a page's `<head>` names: the prerender writes it over the home page's in `index.html`. */
export interface PageHead {
  title: string;
  description: string;
  /** Root-relative with a trailing slash: `/` or `/skills/<name>/`. */
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

/** A page as the build writes it: its head, and the app's markup for its root. */
export interface PrerenderedPage {
  head: PageHead;
  html: string;
}

/** `index.html` carries these too; its test keeps the two in step. */
export const HOME_HEAD: PageHead = {
  title: "Claude Code skills: code review, Laravel, React · AI Toolkit",
  description:
    "Claude Code skills for deep code review and grounded investigation in PHP, TypeScript, Python and beyond, plus dedicated Laravel and React packs.",
  path: "/",
};

function skillPage(
  skill: CatalogSkill,
  skills: readonly CatalogSkill[],
): SitePage {
  return {
    kind: "skill",
    skill,
    siblings: skills.filter(
      (other) => other.plugin === skill.plugin && other !== skill,
    ),
  };
}

/** Every page the build writes: the home page, then one per skill in the given order. */
export function sitePages(skills: readonly CatalogSkill[]): SitePage[] {
  return [{ kind: "home" }, ...skills.map((skill) => skillPage(skill, skills))];
}

export function pageHead(page: SitePage): PageHead {
  if (page.kind === "home") {
    return HOME_HEAD;
  }
  const { skill } = page;
  return {
    title: `${skill.name} — Claude Code skill · AI Toolkit`,
    description: `${skill.summary} A Claude Code skill in the ${skill.plugin} plugin of AI Toolkit.`,
    path: skillPath(skill.name),
  };
}

function decoded(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** The page at `pathname`; anything that names no skill is the home page, as the dev server serves `index.html` there. */
export function pageAt(
  pathname: string,
  skills: readonly CatalogSkill[],
): SitePage {
  const segment = /^\/skills\/([^/]+)\/?$/.exec(pathname)?.[1];
  const name = segment === undefined ? null : decoded(segment);
  const skill = name === null ? null : findSkill(skills, name);
  return skill === null ? { kind: "home" } : skillPage(skill, skills);
}
