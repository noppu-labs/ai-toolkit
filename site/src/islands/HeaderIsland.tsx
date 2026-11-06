import type { ReactElement } from "react";
import { type SectionBase, SiteHeader } from "@/components/sections/SiteHeader";
import { ThemeSync } from "@/components/ThemeSync";

/** The header, with the theme sync every page runs, hydrated as one island. */
export function HeaderIsland({
  sectionBase,
  currentPath,
}: {
  sectionBase: SectionBase;
  currentPath: string;
}): ReactElement {
  return (
    <>
      <ThemeSync />
      <SiteHeader currentPath={currentPath} sectionBase={sectionBase} />
    </>
  );
}
