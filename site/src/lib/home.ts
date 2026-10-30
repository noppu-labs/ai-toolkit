import type { ComponentProps } from "react";
import type { Catalog, PluginEntry } from "../catalog-types.ts";
import type { Band } from "../components/sections/Band.tsx";
import type { Hero } from "../components/sections/Hero.tsx";
import { catalogCounts } from "./catalog.ts";

/** What `index.astro` hands the home page's sections. */
export interface HomeProps {
  hero: ComponentProps<typeof Hero>;
  band: ComponentProps<typeof Band>;
  plugins: PluginEntry[];
}

export function homeProps(catalog: Catalog): HomeProps {
  const { pluginCount, skillCount } = catalogCounts(catalog);
  return {
    hero: {
      description: catalog.marketplaceDescription,
      pluginCount,
      skillCount,
    },
    band: { skillCount },
    plugins: catalog.plugins,
  };
}
