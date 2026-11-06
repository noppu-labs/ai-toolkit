import { SITE_URL } from "./site.ts";

/** A page's address on production, which its canonical link and `og:url` name. */
export function canonicalUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** The browser chrome's colour per OS theme, in two theme-color metas; the no-flash script points both at the theme on screen. */
export const THEME_COLORS = { light: "#fff4f9", dark: "#2a2229" } as const;

export const SITE_NAME = "Noppu Labs AI Toolkit";

/** The image a link preview shows, which `Base.astro` writes into the `og:image` tags. */
export interface SocialImage {
  /** Absolute, on production. */
  url: string;
  /** Its MIME type, such as `image/png`. */
  type: string;
  width: number;
  height: number;
  alt: string;
}

/** The 1200×630 card link previews show; `npm run og-image` renders it into `public/`. */
export const SOCIAL_CARD: SocialImage = {
  url: canonicalUrl("/og-image.png"),
  type: "image/png",
  width: 1200,
  height: 630,
  alt: "AI Toolkit by Noppu Labs: agent skills for deep code review and grounded investigation, beside the pink axolotl mascot.",
};
