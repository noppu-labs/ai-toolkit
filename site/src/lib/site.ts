/** Where the site is published; links meant to be shared start here. */
export const SITE_URL = "https://toolkit.noppu.com";

/** The shareable link to a skill: the catalog, with the skill open. */
export function skillShareUrl(skill: string): string {
  const params = new URLSearchParams({ skill });
  return `${SITE_URL}/?${params.toString()}#skills`;
}
