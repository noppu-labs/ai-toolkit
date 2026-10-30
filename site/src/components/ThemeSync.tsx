import { useEffect } from "react";
import { useResolvedTheme } from "@/hooks/useResolvedTheme";

// The layout's head (`Base.astro`) carries a light and a dark theme-color meta keyed
// on the OS setting, so both are pointed at the chosen theme. Its no-flash script
// already overwrote their content, leaving each meta's own colour in `data-color`.
// The metas are read in the effect: the build also renders this module, with no document.
export function ThemeSync(): null {
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const metas = Array.from(
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    );
    const color = metas.find((meta) => meta.media.includes(theme))?.dataset
      .color;
    if (color === undefined) {
      return;
    }
    for (const meta of metas) {
      meta.content = color;
    }
  }, [theme]);

  return null;
}
