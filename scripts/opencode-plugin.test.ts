import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Skill } from "@opencode/plugin";
import { describe, expect, it, vi } from "vitest";
import {
  type LoadedSkill,
  loadSkills,
} from "../packages/opencode-toolkit-core/load-skills.ts";
import defaultPlugin, { makePlugin } from "../review/opencode/index.ts";

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

type FakeEditor = { editor: SkillEditor; added: Skill.Info[] };

const PACKAGE_ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "review",
);

function makeFakeContext(): {
  ctx: Plugin.Context;
  transform: ReturnType<typeof vi.fn>;
  run: (editor: SkillEditor) => void;
} {
  let captured: ((editor: SkillEditor) => void) | undefined;
  const transform = vi.fn(async (callback: (editor: SkillEditor) => void) => {
    captured = callback;

    return { dispose: async (): Promise<void> => {} };
  });
  // The plugin only touches ctx.skill.transform, so a partial context stands in for the full one.
  const ctx = { skill: { transform } } as unknown as Plugin.Context;

  return {
    ctx,
    transform,
    run: (editor: SkillEditor): void => {
      if (!captured) {
        throw new Error("transform callback was never registered");
      }

      captured(editor);
    },
  };
}

function makeFakeEditor(existing: readonly string[] = []): FakeEditor {
  const added: Skill.Info[] = [];
  // Only get and add are exercised, so the other editor methods are left out.
  const editor = {
    get: (id: string): unknown => (existing.includes(id) ? { id } : undefined),
    add: (skill: Skill.Info): void => {
      added.push(skill);
    },
  } as unknown as SkillEditor;

  return { editor, added };
}

describe("makePlugin", () => {
  it("registers one transform", async () => {
    const { ctx, transform } = makeFakeContext();

    await makePlugin(PACKAGE_ROOT).setup(ctx);

    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("adds every skill with rewritten content and package paths", async () => {
    const { ctx, run } = makeFakeContext();
    const fake: FakeEditor = makeFakeEditor();

    await makePlugin(PACKAGE_ROOT).setup(ctx);
    run(fake.editor);

    const ids: string[] = loadSkills(PACKAGE_ROOT, "review").map(
      (skill: LoadedSkill): string => skill.id,
    );

    expect(fake.added.map((skill: Skill.Info): string => skill.id)).toEqual(
      ids,
    );
    expect(ids.length).toBeGreaterThan(0);

    for (const skill of fake.added) {
      expect(skill.content).not.toContain(`\${CLAUDE_PLUGIN_ROOT}`);
      expect(skill.path.startsWith(PACKAGE_ROOT)).toBe(true);
    }
  });

  it("skips ids the editor already has", async () => {
    const { ctx, run } = makeFakeContext();
    const fake: FakeEditor = makeFakeEditor(["pr-review"]);

    await makePlugin(PACKAGE_ROOT).setup(ctx);
    run(fake.editor);

    const ids: string[] = fake.added.map(
      (skill: Skill.Info): string => skill.id,
    );

    expect(ids).not.toContain("pr-review");
    expect(ids).toContain("comment-audit");
  });

  it("loads once however many editors the transform runs against", async () => {
    const { ctx, run } = makeFakeContext();
    const load = vi.fn((root: string) => loadSkills(root, "review"));
    const editors: FakeEditor[] = [
      makeFakeEditor(),
      makeFakeEditor(),
      makeFakeEditor(),
    ];

    await makePlugin(PACKAGE_ROOT, load).setup(ctx);

    for (const fake of editors) {
      run(fake.editor);
    }

    expect(load).toHaveBeenCalledTimes(1);

    const expected: number = loadSkills(PACKAGE_ROOT, "review").length;

    for (const fake of editors) {
      expect(fake.added).toHaveLength(expected);
    }
  });

  it("rejects when the skills directory is missing", async () => {
    const { ctx } = makeFakeContext();

    await expect(makePlugin("/nonexistent").setup(ctx)).rejects.toThrow(
      "/nonexistent/skills",
    );
  });
});

describe("default export", () => {
  it("rewrites paths without a doubled separator", async () => {
    const { ctx, run } = makeFakeContext();
    const fake: FakeEditor = makeFakeEditor();

    await defaultPlugin.setup(ctx);
    run(fake.editor);

    expect(fake.added.length).toBeGreaterThan(0);

    for (const skill of fake.added) {
      expect(skill.content).not.toContain("//skills/");
      expect(skill.path).not.toContain("//");
    }
  });
});
