export interface SkillEntry {
  name: string;
  description: string;
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
