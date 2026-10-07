export const RESOLVED_THEMES = ["light", "dark"] as const;
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

/** The one OS colour-scheme query the page reads and listens to. */
export const prefersDarkQuery: MediaQueryList = window.matchMedia(
  "(prefers-color-scheme: dark)",
);

export function systemPrefersDark(): boolean {
  return prefersDarkQuery.matches;
}
