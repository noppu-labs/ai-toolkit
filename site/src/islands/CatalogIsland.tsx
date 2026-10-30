import type { ReactElement } from "react";
import type { PluginEntry } from "@/catalog-types";
import { SkillsCatalog } from "@/components/sections/SkillsCatalog";
import { useScrollToHashOnLoad } from "@/hooks/useScrollToHashOnLoad";

/** The skills catalog, which also scrolls to the URL's fragment once it is on screen. */
export function CatalogIsland({
  plugins,
}: {
  plugins: PluginEntry[];
}): ReactElement {
  useScrollToHashOnLoad();

  return <SkillsCatalog plugins={plugins} />;
}
