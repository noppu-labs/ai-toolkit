import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, Skill } from "@opencode/plugin";
import { afterEach, describe, expect, it, vi } from "vitest";

type PackFile = { path: string };

type PackResult = { files: PackFile[] };

type SkillEditor = Parameters<
  Parameters<Plugin.Context["skill"]["transform"]>[0]
>[0];

const REVIEW_DIR: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "review",
);

const LOCKFILES: readonly string[] = [
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "yarn.lock",
];

const temporaryDirs: string[] = [];

function listSkillIds(root: string): string[] {
  return readdirSync(join(root, "skills"), { withFileTypes: true })
    .filter((entry): boolean => entry.isDirectory())
    .map((entry): string => entry.name)
    .sort();
}

function readPackedPaths(): string[] {
  const output: string = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts", "--workspaces=false"],
    { cwd: REVIEW_DIR, encoding: "utf8" },
  );
  const results: PackResult[] = JSON.parse(output);

  return (results[0]?.files ?? []).map((file: PackFile): string => file.path);
}

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("npm package contents", () => {
  it("ships the plugin, the skills and the docs, and nothing Claude-only", () => {
    const paths: string[] = readPackedPaths();

    for (const required of [
      "package.json",
      "README.md",
      "LICENSE",
      "opencode/index.ts",
      "opencode/load-skills.ts",
      ...listSkillIds(REVIEW_DIR).map(
        (id: string): string => `skills/${id}/SKILL.md`,
      ),
    ]) {
      expect(paths).toContain(required);
    }

    for (const path of paths) {
      expect(path).not.toMatch(/^(hooks|workflows|\.claude-plugin)\//);
      expect(path).not.toMatch(/skills-lock\.json|\.lock/);
    }
  });

  it("matches the Claude plugin version", () => {
    const manifest: { version: string } = JSON.parse(
      readFileSync(join(REVIEW_DIR, "package.json"), "utf8"),
    );
    const plugin: { version: string } = JSON.parse(
      readFileSync(join(REVIEW_DIR, ".claude-plugin", "plugin.json"), "utf8"),
    );

    expect(manifest.version).toBe(plugin.version);
  });

  it("has no lockfile, which would make Claude Code run npm install", () => {
    for (const name of LOCKFILES) {
      expect(existsSync(join(REVIEW_DIR, name))).toBe(false);
    }
  });

  it("registers the skills from the extracted tarball", {
    skip: !process.env.OPENCODE_REVIEW_TARBALL,
  }, async () => {
    const tarball: string = process.env.OPENCODE_REVIEW_TARBALL ?? "";
    const extracted: string = realpathSync(
      mkdtempSync(join(tmpdir(), "opencode-review-")),
    );

    temporaryDirs.push(extracted);
    execFileSync("tar", [
      "-xzf",
      tarball,
      "-C",
      extracted,
      "--strip-components=1",
    ]);

    const loaded: { default: Plugin.Plugin } = await import(
      join(extracted, "opencode", "index.ts")
    );
    const added: Skill.Info[] = [];
    let captured: ((editor: SkillEditor) => void) | undefined;
    // The plugin only touches ctx.skill.transform, so a partial context stands in for the full one.
    const ctx = {
      skill: {
        transform: vi.fn(async (callback: (editor: SkillEditor) => void) => {
          captured = callback;

          return { dispose: async (): Promise<void> => {} };
        }),
      },
    } as unknown as Plugin.Context;

    await loaded.default.setup(ctx);
    // Only get and add are exercised, so the other editor methods are left out.
    captured?.({
      get: (): undefined => undefined,
      add: (skill: Skill.Info): void => {
        added.push(skill);
      },
    } as unknown as SkillEditor);

    expect(added.map((skill: Skill.Info): string => skill.id)).toEqual(
      listSkillIds(extracted),
    );

    for (const skill of added) {
      expect(skill.path.startsWith(extracted)).toBe(true);
    }
  });
});
