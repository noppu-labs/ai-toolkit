import summaries from "@/locales/en/skills.json";
import type { SkillEntry } from "../catalog-types.ts";

/** Plain-language summaries of the skills, by plugin, then skill. */
export type SkillSummaries = Readonly<
  Record<string, Readonly<Record<string, string>>>
>;

/** One-line summaries for people browsing; SKILL.md descriptions are written for agents deciding when to load a skill. */
export const SKILL_SUMMARIES: SkillSummaries = summaries;

/** The text up to the first full stop, question or exclamation mark that ends a sentence. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = /[.!?](?=\s|$)/.exec(trimmed);
  return end === null ? trimmed : trimmed.slice(0, end.index + 1);
}

/** A skill's summary, or the first sentence of its SKILL.md description when the locale file has none. */
export function skillSummary(
  plugin: string,
  skill: Pick<SkillEntry, "name" | "description">,
  source: SkillSummaries = SKILL_SUMMARIES,
): string {
  return source[plugin]?.[skill.name] ?? firstSentence(skill.description);
}
