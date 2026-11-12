export interface SkillEntry {
  name: string;
  description: string;
  /** The SKILL.md's path from the repository root, such as `investigate/skills/brief/SKILL.md`. */
  path: string;
  sourceUrl: string;
}

export interface PluginEntry {
  name: string;
  description: string;
  version: string;
  agentCount: number;
  ruleCount: number;
  skills: SkillEntry[];
  /** The npm package of the plugin's OpenCode build, when it has one. */
  opencodePackage?: string;
}

export interface Catalog {
  marketplaceName: string;
  marketplaceDescription: string;
  plugins: PluginEntry[];
}
