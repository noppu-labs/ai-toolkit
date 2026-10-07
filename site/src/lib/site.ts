/** On the page's own origin, so a link copied on a preview deployment opens that preview. */
export function skillShareUrl(skill: string): string {
  const params = new URLSearchParams({ skill });
  return `${window.location.origin}/?${params.toString()}#skills`;
}

/** Production's origin: the canonical link, the social card tags, robots.txt and sitemap.xml name it. */
export const SITE_URL = "https://toolkit.noppu.com";
