import jetbrainsMono from "@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?url";
import spaceGrotesk from "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url";

/**
 * The built URLs of `ABOVE_THE_FOLD_FONTS`, the files `app.css` loads for them: the head preloads
 * them, so they download alongside the CSS rather than after it.
 */
export const ABOVE_THE_FOLD_FONT_URLS: readonly string[] = [
  spaceGrotesk,
  jetbrainsMono,
];
