import type { Plugin, Skill } from "@opencode/plugin";
import { type LoadedSkill, loadSkills } from "./load-skills.ts";

export type PluginOptions = {
  id: string;
  namespace: string;
  packageRoot: string;
};

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

// The brands are type-only: ids are skill directory names and paths join an
// absolute package root, so the casts below add no unchecked assumption.
function makeSkillInfo(skill: LoadedSkill): Skill.Info {
  return {
    id: skill.id as Skill.Info["id"],
    name: skill.name as Skill.Info["name"],
    description: skill.description,
    path: skill.path as Skill.Info["path"],
    content: skill.content,
  };
}

export function makePlugin(
  options: PluginOptions,
  load: (root: string, namespace: string) => LoadedSkill[] = loadSkills,
): Plugin.Plugin {
  return {
    id: options.id,
    async setup(ctx: Plugin.Context): Promise<void> {
      const skills: Skill.Info[] = load(
        options.packageRoot,
        options.namespace,
      ).map(makeSkillInfo);

      await ctx.skill.transform((editor: SkillEditor): void => {
        for (const skill of skills) {
          if (!editor.get(skill.id)) {
            editor.add(skill);
          }
        }
      });
    },
  } satisfies Plugin.Plugin;
}
