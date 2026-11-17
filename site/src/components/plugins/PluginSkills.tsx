import type { ReactElement } from "react";
import { PluginSection } from "@/components/opencode/PluginSections";
import { SkillRows } from "@/components/SkillRows";
import type { CatalogSkill } from "@/lib/catalog";

/** A plugin page's list of its skills, each row linking to the skill's page. */
export function PluginSkills({
  plugin,
  skills,
  eyebrow,
  id,
}: {
  plugin: string;
  skills: readonly CatalogSkill[];
  eyebrow: string;
  /** The section's id, which links to the skills point at. */
  id: string;
}): ReactElement {
  return (
    <PluginSection
      className="scroll-mt-header"
      eyebrow={eyebrow}
      heading={`The ${plugin} skills.`}
      id={id}
    >
      <SkillRows skills={skills} />
    </PluginSection>
  );
}
