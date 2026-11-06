import type { OpenCodePage } from "./load-opencode.ts";
import { type OpenCodePlugin, opencodePluginPath } from "./opencode.ts";
import { pluginColorClass } from "./plugins.ts";

/** What a card or a list row needs to show a synced OpenCode plugin. */
export interface OpenCodeCard {
  name: string;
  version: string;
  summary: string;
  chips: string[];
  /** The first install command of the first host. */
  command: string;
  /** The plugin's own page. */
  href: string;
  accentClass: string;
  image?: { src: string; width: number; height: number; alt: string };
}

export function openCodeCard(
  plugin: OpenCodePlugin<OpenCodePage>,
  withImage: boolean,
): OpenCodeCard {
  const { page } = plugin;
  const command = page.install.hosts[0]?.commands[0];
  if (command === undefined) {
    throw new Error(`${plugin.name}: the manifest has no install command`);
  }
  const { src, width, height } = page.image.src;
  return {
    name: plugin.name,
    version: plugin.version,
    summary: page.summary,
    chips: page.chips,
    command,
    href: opencodePluginPath(plugin.name),
    accentClass: pluginColorClass(plugin.name),
    ...(withImage
      ? { image: { src, width, height, alt: page.image.alt } }
      : {}),
  };
}
