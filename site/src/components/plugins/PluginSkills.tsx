import type { ReactElement } from "react";
import { PluginSection } from "@/components/opencode/PluginSections";
import { SkillRows } from "@/components/SkillRows";
import type { CatalogSkill } from "@/lib/catalog";

export function PluginSkills({
  plugin,
  skills,
  eyebrow,
  id,
}: {
  plugin: string;
  skills: readonly CatalogSkill[];
  eyebrow: string;
  /** The section's id, the target of links to the skills. */
  id: string;
}): ReactElement {
  return (
    <PluginSection
      className="scroll-mt-header"
      eyebrow={eyebrow}
      heading={`The ${plugin} skills.`}
      id={id}
    >
      <SkillRows className="mt-6 md:mt-8" skills={skills} />
    </PluginSection>
  );
}
