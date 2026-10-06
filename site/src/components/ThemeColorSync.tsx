import { useTheme } from "next-themes";
import { useEffect } from "react";

// index.html carries a light and a dark theme-color meta keyed on the OS setting,
// so both are pointed at the chosen theme. Their colours are read once, before the
// first sync overwrites them.
const metas = Array.from(
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
);
const colorFor = (scheme: "light" | "dark"): string | undefined =>
  metas.find((meta) => meta.media.includes(scheme))?.content;
const LIGHT = colorFor("light");
const DARK = colorFor("dark");

export function ThemeColorSync(): null {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const color = resolvedTheme === "dark" ? DARK : LIGHT;
    if (color === undefined) {
      return;
    }
    for (const meta of metas) {
      meta.content = color;
    }
  }, [resolvedTheme]);

  return null;
}
