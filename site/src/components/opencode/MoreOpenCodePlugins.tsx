import type { ReactElement } from "react";
import type { PluginEntry } from "@/catalog-types";
import { PluginLinkList } from "@/components/PluginLinkList";
import { OPENCODE_PATH } from "@/lib/opencode";
import type { OpenCodeCard } from "@/lib/opencode-cards";
import type { PluginLinkRow } from "@/lib/plugin-pages";
import { pluginColorClass, sortPlugins } from "@/lib/plugins";

function toolkitRows(plugins: readonly PluginEntry[]): PluginLinkRow[] {
  return sortPlugins(plugins)
    .filter((plugin) => plugin.opencodePackage !== undefined)
    .map((plugin) => ({
      name: plugin.name,
      summary: plugin.description,
      href: OPENCODE_PATH,
      accentClass: pluginColorClass(plugin.name),
    }));
}

/** The foot of a plugin page: the other synced plugins, the toolkit's OpenCode packages and the hub. */
export function MoreOpenCodePlugins({
  plugins,
  toolkitPlugins,
}: {
  /** The other synced plugins, each linking to its page. */
  plugins: readonly OpenCodeCard[];
  /** The toolkit's plugins; those with an OpenCode package are listed, linking to the hub. */
  toolkitPlugins: readonly PluginEntry[];
}): ReactElement {
  const rows: PluginLinkRow[] = [...plugins, ...toolkitRows(toolkitPlugins)];

  return (
    <PluginLinkList
      allHref={OPENCODE_PATH}
      allLabel="All OpenCode plugins"
      heading="More OpenCode plugins"
      rows={rows}
    />
  );
}
