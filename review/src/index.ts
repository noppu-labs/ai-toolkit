import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Hooks,
  Plugin,
  PluginInput,
  PluginOptions,
} from "@opencode-ai/plugin";
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

function parseFrontmatter(content: string): {
  name: string;
  description: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || match[1] === undefined) {
    throw new Error("SKILL.md missing frontmatter");
  }
  const frontmatter = yaml.load(match[1]) as Record<string, unknown>;
  const name = frontmatter.name;
  const description = frontmatter.description;
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
      name: name || entry.name,
      description,
      path: "",
      content,
    });
  }

  return skills;
}

function copySkillsToTarget(): void {
  const skillsDir = getSkillsDir();
  const targetDir = getTargetDir();

  if (!existsSync(skillsDir)) {
    return;
  }

  copyDirectory(skillsDir, targetDir);
}

function copyDirectory(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export const server: Plugin = async (
  _input: PluginInput,
  _options?: PluginOptions,
): Promise<Hooks> => {
  // Copy skills to disk so OpenCode can discover them.
  // Skills are loaded from ~/.opencode/skills/ automatically.
  copySkillsToTarget();

  return {};
};

export default server;
