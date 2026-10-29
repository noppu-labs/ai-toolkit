/**
 * Production's origin: the canonical links, the social card tags, robots.txt and the
 * sitemaps name it. The sitemaps take it from `site` in `astro.config.ts`.
 */
export const SITE_URL = "https://toolkit.noppu.com";

/** A skill's own page, which the build prerenders. */
export function skillPath(skill: string): string {
  return `/skills/${encodeURIComponent(skill)}`;
}

/**
 * On the page's own origin, so a link copied on a preview deployment opens that preview.
 * Astro renders the page in Node at build time, where there is no window, so the built
 * HTML names production.
 */
export function skillShareUrl(skill: string): string {
  const origin =
    typeof window === "undefined" ? SITE_URL : window.location.origin;
  return `${origin}${skillPath(skill)}`;
}
