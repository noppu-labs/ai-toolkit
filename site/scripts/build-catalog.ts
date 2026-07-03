#!/usr/bin/env -S npx tsx
/**
 * Generates site/src/generated/catalog.json from the repository's plugin
 * manifests and SKILL.md frontmatter. Fails loudly on malformed input so a
 * broken skill file breaks CI instead of silently vanishing from the site.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Catalog, PluginEntry, SkillEntry } from "../src/catalog-types.ts";
import { parseFrontmatter } from "./frontmatter.ts";

const REPO_URL = "https://github.com/noppu-labs/ai-toolkit";

interface MarketplacePlugin {
  name: string;
  source: string;
  description: string;
}

interface MarketplaceManifest {
  name: string;
  description: string;
  plugins: MarketplacePlugin[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value === "") {
    throw new Error(`${label}: expected a non-empty string`);
  }
  return value;
}

function countEntries(dir: string): number {
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

function readSkills(pluginDir: string, pluginDirName: string): SkillEntry[] {
  const skillsDir = join(pluginDir, "skills");
  const entries = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return entries.map((skillDir): SkillEntry => {
    const skillPath = join(skillsDir, skillDir, "SKILL.md");
    const relPath = `${pluginDirName}/skills/${skillDir}/SKILL.md`;
    if (!existsSync(skillPath)) {
      throw new Error(`${relPath}: SKILL.md not found`);
    }
    const fields = parseFrontmatter(readFileSync(skillPath, "utf8"), relPath);
    return {
      name: requireString(fields.name, `${relPath}: frontmatter "name"`),
      description: requireString(
        fields.description,
        `${relPath}: frontmatter "description"`,
      ),
      sourceUrl: `${REPO_URL}/blob/main/${relPath}`,
    };
  });
}

function readPlugin(rootDir: string, plugin: MarketplacePlugin): PluginEntry {
  const dirName = plugin.source.replace(/^\.\//, "");
  const pluginDir = join(rootDir, dirName);
  const manifest = readJson(
    join(pluginDir, ".claude-plugin", "plugin.json"),
  ) as {
    version?: unknown;
  };
  return {
    name: plugin.name,
    description: plugin.description,
    version: requireString(
      manifest.version,
      `${dirName}/plugin.json "version"`,
    ),
    agentCount: countEntries(join(pluginDir, "agents")),
    ruleCount: countEntries(join(pluginDir, "rules")),
    skills: readSkills(pluginDir, dirName),
  };
}

export function buildCatalog(rootDir: string): Catalog {
  const marketplace = readJson(
    join(rootDir, ".claude-plugin", "marketplace.json"),
  ) as MarketplaceManifest;
  return {
    marketplaceName: requireString(marketplace.name, 'marketplace.json "name"'),
    marketplaceDescription: requireString(
      marketplace.description,
      'marketplace.json "description"',
    ),
    plugins: marketplace.plugins.map((plugin) => readPlugin(rootDir, plugin)),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const catalog = buildCatalog(rootDir);
  const outDir = join(rootDir, "site", "src", "generated");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
  );
  const skillCount = catalog.plugins.reduce((n, p) => n + p.skills.length, 0);
  console.log(
    `catalog.json written: ${catalog.plugins.length} plugins, ${skillCount} skills`,
  );
}
