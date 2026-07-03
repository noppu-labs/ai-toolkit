import type { ReactElement } from "react";
import type { Catalog } from "./catalog-types.ts";
import { Footer } from "./components/sections/Footer.tsx";
import { Hero } from "./components/sections/Hero.tsx";
import { PluginCards } from "./components/sections/PluginCards.tsx";
import { SecuritySection } from "./components/sections/SecuritySection.tsx";
import { SkillsCatalog } from "./components/sections/SkillsCatalog.tsx";
import catalogJson from "./generated/catalog.json";

const catalog: Catalog = catalogJson;

export default function App(): ReactElement {
  return (
    <>
      <Hero description={catalog.marketplaceDescription} />
      <main>
        <PluginCards plugins={catalog.plugins} />
        <SkillsCatalog plugins={catalog.plugins} />
        <SecuritySection />
      </main>
      <Footer />
    </>
  );
}
