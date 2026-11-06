import { canonicalUrl } from "./head.ts";

/**
 * The JSON-LD text of a `BreadcrumbList`, each crumb's `item` an absolute URL on
 * production. Every `<` is written as `<`, which JSON reads back as `<`,
 * so no name can close the `<script>` element the text goes into.
 */
export function breadcrumbJsonLd(
  crumbs: readonly { name: string; path: string }[],
): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: canonicalUrl(crumb.path),
    })),
  };
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
