/**
 * The fontsource files the first screen sets its text in: the head preloads them, and the social
 * card renders with them. Plain basenames and no imports, so `tsx` scripts can load this too.
 */
export const ABOVE_THE_FOLD_FONTS: readonly string[] = [
  "space-grotesk-latin-wght-normal.woff2",
  "jetbrains-mono-latin-wght-normal.woff2",
];
