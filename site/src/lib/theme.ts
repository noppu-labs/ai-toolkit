export type ResolvedTheme = "light" | "dark";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemPrefersDark(): boolean {
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}
