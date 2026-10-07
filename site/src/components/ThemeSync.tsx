import { useEffect } from "react";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";

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

/** Applies the resolved theme to `<html>` (the `dark` class and `color-scheme`) and the theme-color metas. */
export function ThemeSync(): null {
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const color = theme === "dark" ? DARK : LIGHT;
    if (color === undefined) {
      return;
    }
    for (const meta of metas) {
      meta.content = color;
    }
  }, [theme]);

  return null;
}
