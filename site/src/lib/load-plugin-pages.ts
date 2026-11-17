import { getCollection } from "astro:content";
import { loadCatalog } from "./load-catalog.ts";
import type { PluginPageCopy } from "./plugin-page-schema.ts";
import { joinPluginPages, type PluginPage } from "./plugin-pages.ts";

/** Every plugin beside its page copy, in the site's plugin order. */
export async function loadPluginPages(): Promise<PluginPage<PluginPageCopy>[]> {
  return joinPluginPages(
    (await loadCatalog()).plugins,
    await getCollection("plugins"),
  );
}
