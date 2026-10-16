import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Skill } from "@opencode/plugin";
import { type LoadedSkill, loadSkills } from "./load-skills.ts";

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

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
  packageRoot: string,
  load: (root: string) => LoadedSkill[] = loadSkills,
): Plugin.Plugin {
  return {
    id: "noppu-labs.review",
    async setup(ctx: Plugin.Context): Promise<void> {
      const skills: Skill.Info[] = load(packageRoot).map(makeSkillInfo);

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

export default makePlugin(
  resolve(fileURLToPath(new URL("..", import.meta.url))),
);
