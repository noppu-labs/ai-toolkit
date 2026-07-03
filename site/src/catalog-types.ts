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
}

export interface Catalog {
  marketplaceName: string;
  marketplaceDescription: string;
  plugins: PluginEntry[];
}
