import type { ReactElement, ReactNode } from "react";
import { Footer } from "@/components/sections/Footer";
import {
  SiteHeader,
  type SiteHeaderProps,
} from "@/components/sections/SiteHeader";

interface PageFrameProps extends Required<SiteHeaderProps> {
  children: ReactNode;
}

/** What every page shares: the skip link, the header, `<main>` and the footer. */
export function PageFrame({
  sectionBase,
  children,
}: PageFrameProps): ReactElement {
  return (
    // `overflow-x: clip` (unlike `hidden`) keeps the sticky header working.
    <div className="min-h-screen overflow-x-clip bg-grid font-base text-foreground">
      <a
        className="absolute top-3 -left-[9999px] z-50 rounded-base border-2 border-border bg-plugin-review px-3.5 py-2.5 font-bold text-black no-underline focus:left-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href="#main"
      >
        Skip to content
      </a>
      <SiteHeader sectionBase={sectionBase} />
      {/* tabIndex: focusable from script, for "Back to top". */}
      {/* biome-ignore lint/correctness/useUniqueElementIds: the skip link's target; the page renders once. */}
      <main className="scroll-mt-header outline-hidden" id="main" tabIndex={-1}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
