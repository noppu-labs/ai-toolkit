import { renderToString } from "react-dom/server";
import type { Catalog } from "./catalog-types.ts";
import catalogJson from "./generated/catalog.json";
import { catalogSkills } from "./lib/catalog.ts";
import { type PrerenderedPage, pageHead, sitePages } from "./lib/pages.ts";
import { Page } from "./Page.tsx";

const catalog: Catalog = catalogJson;

/** Every page of the site, rendered to HTML; `scripts/prerender.ts` writes them out at build time. */
export function prerenderPages(): PrerenderedPage[] {
  return sitePages(catalogSkills(catalog.plugins)).map((page) => ({
    head: pageHead(page),
    html: renderToString(<Page page={page} />),
  }));
}
