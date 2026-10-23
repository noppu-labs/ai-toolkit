import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Skill } from "@opencode/plugin";
import { describe, expect, it, vi } from "vitest";
import investigatePlugin from "../investigate/opencode/index.ts";
import {
  parseSkillFile,
  rewriteSkillContent,
} from "../packages/opencode-toolkit-core/load-skills.ts";

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

const INVESTIGATE_ROOT: string = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "investigate"),
);

async function loadInvestigateSkills(): Promise<Skill.Info[]> {
  let captured: ((editor: SkillEditor) => void) | undefined;
  const transform = vi.fn(async (callback: (editor: SkillEditor) => void) => {
    captured = callback;

    return { dispose: async (): Promise<void> => {} };
  });
  // The plugin only touches ctx.skill.transform, so a partial context stands in for the full one.
  const ctx = { skill: { transform } } as unknown as Plugin.Context;
  const added: Skill.Info[] = [];
  // Only get and add are exercised, so the other editor methods are left out.
  const editor = {
    get: (): unknown => undefined,
    add: (skill: Skill.Info): void => {
      added.push(skill);
    },
  } as unknown as SkillEditor;

  await investigatePlugin.setup(ctx);

  if (!captured) {
    throw new Error("transform callback was never registered");
  }

  captured(editor);

  return added;
}

describe("investigate OpenCode plugin", () => {
  it("uses the investigate plugin id", () => {
    expect(investigatePlugin.id).toBe("noppu-labs.investigate");
  });

  it("registers brief, deep and spec with name equal to id", async () => {
    const skills: Skill.Info[] = await loadInvestigateSkills();

    expect(skills.map((skill: Skill.Info): string => skill.id)).toEqual([
      "investigate-brief",
      "investigate-deep",
      "investigate-spec",
    ]);

    for (const skill of skills) {
      expect(skill.name).toBe(skill.id);
    }
  });

  it("leaves no Claude-only references in content or description", async () => {
    const skills: Skill.Info[] = await loadInvestigateSkills();

    for (const skill of skills) {
      for (const text of [skill.content, skill.description]) {
        expect(text).not.toContain("investigate:");
        expect(text).not.toContain(`\${CLAUDE_PLUGIN_ROOT}`);
      }
    }
  });

  it("points the brief at the real script path", async () => {
    const skills: Skill.Info[] = await loadInvestigateSkills();
    const brief: Skill.Info | undefined = skills.find(
      (skill: Skill.Info): boolean => skill.id === "investigate-brief",
    );
    const script: string = join(
      INVESTIGATE_ROOT,
      "skills",
      "brief",
      "scripts",
      "brief.mjs",
    );

    expect(brief?.content).toContain(`node "${script}"`);
  });

  it("keeps the brief command valid for an install path with a space", () => {
    const body: string = parseSkillFile(
      readFileSync(
        join(INVESTIGATE_ROOT, "skills", "brief", "SKILL.md"),
        "utf8",
      ),
    ).body;
    const rewritten: string = rewriteSkillContent(body, {
      packageRoot: "/tmp/Jane Doe/investigate",
      namespace: "investigate",
      ids: new Set(["brief", "deep", "spec"]),
    });

    expect(rewritten).toContain(
      'node "/tmp/Jane Doe/investigate/skills/brief/scripts/brief.mjs"',
    );
  });

  it("keeps every path under the investigate root", async () => {
    const skills: Skill.Info[] = await loadInvestigateSkills();

    for (const skill of skills) {
      expect(skill.path.startsWith(INVESTIGATE_ROOT)).toBe(true);
    }
  });
});
