import type { ReactElement } from "react";
import App from "./App.tsx";
import type { SitePage } from "./lib/pages.ts";
import { SkillPage } from "./SkillPage.tsx";

/** The page the URL names; `main.tsx` and the build's prerender both render it. */
export function Page({ page }: { page: SitePage }): ReactElement {
  return page.kind === "home" ? (
    <App />
  ) : (
    <SkillPage siblings={page.siblings} skill={page.skill} />
  );
}
