import type { PluginEntry } from "../catalog-types.ts";
import { pluginColorClass, sortPlugins } from "./plugins.ts";
import { pluginPath } from "./site.ts";

export interface PluginPage<P> {
  plugin: PluginEntry;
  copy: P;
}

/**
 * In the site's plugin order. Throws when either side has a name the other lacks, so no plugin
 * ships without a page and no manifest without a plugin.
 */
export function joinPluginPages<P>(
  plugins: readonly PluginEntry[],
  entries: readonly { id: string; data: P }[],
): PluginPage<P>[] {
  const copies = new Map(entries.map((entry) => [entry.id, entry.data]));
  const names = new Set(plugins.map((plugin) => plugin.name));
  const unmatched = [
    ...plugins.filter((plugin) => !copies.has(plugin.name)).map((p) => p.name),
    ...entries.filter((entry) => !names.has(entry.id)).map((e) => e.id),
  ];
  if (unmatched.length > 0) {
    throw new Error(
      `plugins collection and the catalog disagree: ${unmatched.join(", ")}`,
    );
  }

  return sortPlugins(plugins).flatMap((plugin) => {
    const copy = copies.get(plugin.name);

    return copy === undefined ? [] : [{ plugin, copy }];
  });
}

export interface PluginLinkRow {
  name: string;
  summary: string;
  href: string;
  accentClass: string;
}

export function morePluginRows(
  plugins: readonly PluginEntry[],
  current: string,
): PluginLinkRow[] {
  return sortPlugins(plugins)
    .filter((plugin) => plugin.name !== current)
    .map((plugin) => ({
      name: plugin.name,
      summary: plugin.description,
      href: pluginPath(plugin.name),
      accentClass: pluginColorClass(plugin.name),
    }));
}
