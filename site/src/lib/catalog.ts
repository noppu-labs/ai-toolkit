import { skillSummary } from "@/lib/skill-summaries";
import type { PluginEntry, SkillEntry } from "../catalog-types.ts";
import { sortPlugins, sortSkills } from "./plugins.ts";

/** The plugin filter that shows every plugin. */
export const ALL_PLUGINS = "all";

/** Marks each row of the list with its skill's name, so focus can return to it. */
export const SKILL_ROW_ATTRIBUTE = "data-skill-row";

export interface CatalogSkill extends SkillEntry {
  plugin: string;
  /** Plain-language summary for people; `description` is what the agent reads. */
  summary: string;
}

export interface SkillGroup {
  plugin: string;
  /** Every skill of the plugin that matches the filter. */
  skills: CatalogSkill[];
  /** The rows on screen: all of `skills`, or the first few while the group is collapsed. */
  shown: CatalogSkill[];
}

export function catalogSkills(plugins: readonly PluginEntry[]): CatalogSkill[] {
  return sortPlugins(plugins).flatMap((plugin) =>
    sortSkills(plugin.name, plugin.skills).map((skill) => ({
      ...skill,
      plugin: plugin.name,
      summary: skillSummary(plugin.name, skill),
    })),
  );
}

export function matchesQuery(skill: CatalogSkill, query: string): boolean {
  const q = query.trim().toLowerCase();
  return [skill.name, skill.summary, skill.description].some((text) =>
    text.toLowerCase().includes(q),
  );
}

export function inPlugin(skill: CatalogSkill, plugin: string): boolean {
  return plugin === ALL_PLUGINS || skill.plugin === plugin;
}

/** Skill names are unique across plugins: the catalog build fails otherwise. */
export function findSkill(
  skills: readonly CatalogSkill[],
  name: string,
): CatalogSkill | null {
  return skills.find((skill) => skill.name === name) ?? null;
}

interface GroupOptions {
  /** Rows a long group shows before "Show more"; `null` shows every row. A group only one row longer shows it rather than "Show 1 more". */
  collapseAt: number | null;
  expanded: ReadonlySet<string>;
  /** A skill that must stay on screen (the selected one): its group shows every row. */
  pinned: CatalogSkill | null;
}

function shownRows(
  plugin: string,
  skills: CatalogSkill[],
  { collapseAt, expanded, pinned }: GroupOptions,
): CatalogSkill[] {
  if (
    collapseAt === null ||
    skills.length <= collapseAt + 1 ||
    expanded.has(plugin)
  ) {
    return skills;
  }
  const head = skills.slice(0, collapseAt);
  const pinnedHidden =
    pinned !== null && skills.includes(pinned) && !head.includes(pinned);
  return pinnedHidden ? skills : head;
}

/** The filtered skills grouped by plugin, in the given plugin order, without empty groups. */
export function groupSkills(
  skills: readonly CatalogSkill[],
  pluginOrder: readonly string[],
  options: GroupOptions,
): SkillGroup[] {
  return pluginOrder
    .map((plugin) => {
      const members = skills.filter((skill) => skill.plugin === plugin);
      return {
        plugin,
        skills: members,
        shown: shownRows(plugin, members, options),
      };
    })
    .filter((group) => group.skills.length > 0);
}
