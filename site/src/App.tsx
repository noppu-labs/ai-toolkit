import type { ReactElement } from "react";
import type { Catalog } from "./catalog-types.ts";
import { PageFrame } from "./components/PageFrame.tsx";
import { Band } from "./components/sections/Band.tsx";
import { Hero } from "./components/sections/Hero.tsx";
import { InstallSection } from "./components/sections/InstallSection.tsx";
import { PluginCards } from "./components/sections/PluginCards.tsx";
import { SecuritySection } from "./components/sections/SecuritySection.tsx";
import { SkillsCatalog } from "./components/sections/SkillsCatalog.tsx";
import catalogJson from "./generated/catalog.json";
import { useScrollToHashOnLoad } from "./hooks/useScrollToHashOnLoad.ts";

const catalog: Catalog = catalogJson;

const pluginCount: number = catalog.plugins.length;
const skillCount: number = catalog.plugins.reduce(
  (total, plugin) => total + plugin.skills.length,
  0,
);

export default function App(): ReactElement {
  useScrollToHashOnLoad();

  return (
    <PageFrame sectionBase="">
      <Hero
        description={catalog.marketplaceDescription}
        pluginCount={pluginCount}
        skillCount={skillCount}
      />
      <Band skillCount={skillCount} />
      <InstallSection />
      <PluginCards plugins={catalog.plugins} />
      <SkillsCatalog plugins={catalog.plugins} />
      <SecuritySection />
    </PageFrame>
  );
}
