import { useEffect } from "react";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";

// index.html carries a light and a dark theme-color meta keyed on the OS setting,
// so both are pointed at the chosen theme. Its no-flash script already overwrote
// their content, leaving each meta's own colour in `data-color`.
const metas = Array.from(
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
);
const colorFor = (scheme: "light" | "dark"): string | undefined =>
  metas.find((meta) => meta.media.includes(scheme))?.dataset.color;
const LIGHT = colorFor("light");
const DARK = colorFor("dark");

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
