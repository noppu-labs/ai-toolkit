import type { PluginEntry } from "../catalog-types.ts";
import type { OpenCodePage } from "./load-opencode.ts";
import { type OpenCodePlugin, opencodePluginPath } from "./opencode.ts";
import { pluginColorClass, sortPlugins } from "./plugins.ts";
import { pluginSkillsHref } from "./url-state.ts";

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

/** What a card needs to show one of the toolkit's plugins packaged for OpenCode. */
export interface ToolkitOpenCodeCard {
  name: string;
  description: string;
  skillCount: number;
  /** The npm package that carries the plugin's skills. */
  packageName: string;
  command: string;
  /** The home page's skills catalog, filtered to the plugin. */
  skillsHref: string;
  accentClass: string;
}

/** A card for each plugin that has an OpenCode package, in the site's plugin order. */
export function toolkitOpenCodeCards(
  plugins: readonly PluginEntry[],
): ToolkitOpenCodeCard[] {
  return sortPlugins(plugins).flatMap((plugin) =>
    plugin.opencodePackage === undefined
      ? []
      : [
          {
            name: plugin.name,
            description: plugin.description,
            skillCount: plugin.skills.length,
            packageName: plugin.opencodePackage,
            command: `opencode plugin add ${plugin.opencodePackage}`,
            skillsHref: `/${pluginSkillsHref(plugin.name)}`,
            accentClass: pluginColorClass(plugin.name),
          },
        ],
  );
}
