import type { CatalogSkill } from "./catalog.ts";
import type { SocialImage } from "./head.ts";
import { OPENCODE_PATH, opencodePluginPath } from "./opencode.ts";
import { PRIVACY_PATH, skillPath } from "./site.ts";
import { breadcrumbJsonLd } from "./structured-data.ts";

/** What a page's `<head>` names; `Base.astro` writes it into the title, description and social tags. */
export interface PageHead {
  title: string;
  description: string;
  /** Root-relative, with no trailing slash past the root: `/`, `/privacy`, `/skills/<name>`, `/opencode` or `/opencode/<name>`. */
  path: string;
  /** The link preview's image; the site's social card when left out. */
  image?: SocialImage;
  /** JSON-LD text for a `<script type="application/ld+json">`, already safe to write into it. */
  jsonLd?: string;
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

export const OPENCODE_HUB_HEAD: PageHead = {
  title:
    "OpenCode plugins for permission review and prompt caching · AI Toolkit",
  description:
    "Four OpenCode plugins from Noppu Labs: an AI permission reviewer, a prompt cache manager, and the toolkit's review and investigate packages.",
  path: OPENCODE_PATH,
};

export const PRIVACY_HEAD: PageHead = {
  title: "Privacy · AI Toolkit",
  description:
    "What AI Toolkit's site measures with Google Analytics, only with your consent, what it stores in your browser, and how to change your answer.",
  path: PRIVACY_PATH,
};

/** A plugin page's head: the manifest's SEO copy, the plugin's own image and its breadcrumb as JSON-LD. */
export function opencodePluginHead(
  plugin: {
    name: string;
    page: { title: string; seo: { title: string; description: string } };
  },
  image: SocialImage,
): PageHead {
  const path = opencodePluginPath(plugin.name);
  return {
    title: `${plugin.page.seo.title} · AI Toolkit`,
    description: plugin.page.seo.description,
    path,
    image,
    jsonLd: breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "OpenCode", path: OPENCODE_PATH },
      { name: plugin.page.title, path },
    ]),
  };
}

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
  const path = skillPath(skill.name);
  return {
    title: `${skill.name} agent skill · AI Toolkit`,
    description: `${skill.summary} Part of AI Toolkit's ${skill.plugin} plugin for Claude Code, OpenCode and other agents.`,
    path,
    jsonLd: breadcrumbJsonLd([
      { name: "Home", path: "/" },
      {
        name: skill.plugin,
        path: `/?${new URLSearchParams({ plugin: skill.plugin })}`,
      },
      { name: skill.name, path },
    ]),
  };
}
