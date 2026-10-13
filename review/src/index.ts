import type { Hooks, Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin";
import { readFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SkillDef {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
}

function getSkillsDir(): string {
  return join(__dirname, "..", "skills");
}

function getTargetDir(): string {
  return join(homedir(), ".opencode", "skills", "review");
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || match[1] === undefined) {
    throw new Error("SKILL.md missing frontmatter");
  }
  const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
  const name = frontmatter["name"];
  const description = frontmatter["description"];
  if (typeof name !== "string" || typeof description !== "string") {
    throw new Error("SKILL.md frontmatter missing name or description");
  }
  return { name, description };
}

export function collectSkills(): SkillDef[] {
  const skillsDir = getSkillsDir();
  const skills: SkillDef[] = [];

  if (!existsSync(skillsDir)) {
    return skills;
  }

  const entries = readdirSync(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name);
    const skillFilePath = join(skillPath, "SKILL.md");

    if (!existsSync(skillFilePath)) continue;

    const content = readFileSync(skillFilePath, "utf-8");
    const { name, description } = parseFrontmatter(content);

    skills.push({
      id: entry.name,
      name,
      description,
      path: skillFilePath,
      content,
    });
  }

  return skills;
}

function copyDirectory(src: string, dest: string): void {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFileSync(srcPath, destPath);
    }
  }
}

export function copySkillsToTarget(): void {
  const skillsDir = getSkillsDir();
  const targetDir = getTargetDir();
  copyDirectory(skillsDir, targetDir);
}

type SkillSource = {
  name: string;
  description: string;
  content: string;
};

type SkillDraft = {
  source: (source: SkillSource) => void;
  list: () => readonly SkillSource[];
};

type SkillHooks = {
  transform: (callback: (draft: SkillDraft) => Promise<void> | void) => Promise<unknown>;
};

type ReviewHooks = Hooks & {
  skill?: SkillHooks;
};

export const server: Plugin = async (_input: PluginInput, _options?: PluginOptions): Promise<Hooks> => {
  const skills = collectSkills();
  copySkillsToTarget();

  const hooks: ReviewHooks = {};

  // For V2 hosts, register skills via skill.transform.
  // For V1 hosts, the file copy above is the registration mechanism.
  hooks.skill = {
    transform: async (callback) => {
      callback({
        source: () => {
          // Skills are registered via file copy for V1 hosts.
        },
        list: () => skills.map((s) => ({
          name: s.name,
          description: s.description,
          content: s.content,
        })),
      });
    },
  };

  return hooks;
};

export default server;
