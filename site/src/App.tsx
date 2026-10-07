import type { ReactElement } from "react";
import type { Catalog } from "./catalog-types.ts";
import { Band } from "./components/sections/Band.tsx";
import { Footer } from "./components/sections/Footer.tsx";
import { Hero } from "./components/sections/Hero.tsx";
import { InstallSection } from "./components/sections/InstallSection.tsx";
import { PluginCards } from "./components/sections/PluginCards.tsx";
import { SecuritySection } from "./components/sections/SecuritySection.tsx";
import { SiteHeader } from "./components/sections/SiteHeader.tsx";
import { SkillsCatalog } from "./components/sections/SkillsCatalog.tsx";
import catalogJson from "./generated/catalog.json";

const catalog: Catalog = catalogJson;

const pluginCount: number = catalog.plugins.length;
const skillCount: number = catalog.plugins.reduce(
  (total, plugin) => total + plugin.skills.length,
  0,
);

export default function App(): ReactElement {
  return (
    // `overflow-x: clip` (unlike `hidden`) keeps the sticky header working.
    <div className="min-h-screen overflow-x-clip bg-grid font-base text-foreground">
      <a
        className="absolute top-3 -left-[9999px] z-50 rounded-base border-2 border-border bg-plugin-review px-3.5 py-2.5 font-bold text-black no-underline focus:left-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader />
      {/* biome-ignore lint/correctness/useUniqueElementIds: the skip link's target; the page renders once. */}
      <main id="main">
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
      </main>
      <Footer />
    </div>
  );
}
