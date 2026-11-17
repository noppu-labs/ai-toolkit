import type { ReactElement } from "react";
import { PluginSection } from "@/components/opencode/PluginSections";
import { SkillRows } from "@/components/SkillRows";
import type { CatalogSkill } from "@/lib/catalog";

/** A plugin page's list of its skills, each row linking to the skill's page. */
export function PluginSkills({
  plugin,
  skills,
  eyebrow,
}: {
  plugin: string;
  skills: readonly CatalogSkill[];
  eyebrow: string;
}): ReactElement {
  return (
    <PluginSection eyebrow={eyebrow} heading={`The ${plugin} skills.`}>
      <SkillRows skills={skills} />
    </PluginSection>
  );
}
