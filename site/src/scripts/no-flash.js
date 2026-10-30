// No-flash theme, inlined in the head after the theme-color metas: the preferences store's key,
// else (only while that key is unset) the legacy next-themes key, else the OS. Both theme-color
// metas take the chosen colour; each keeps its own in data-color for ThemeSync.
(() => {
  let theme;
  try {
    const stored = localStorage.getItem("ai-toolkit-preferences");
    theme =
      stored === null
        ? localStorage.getItem("theme")
        : JSON.parse(stored)?.state?.theme;
  } catch {}
  const dark =
    theme === "dark" ||
    (theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";

  const metas = [...document.querySelectorAll('meta[name="theme-color"]')];
  for (const meta of metas) {
    meta.dataset.color = meta.content;
  }
  const scheme = dark ? "dark" : "light";
  const color = metas.find((meta) => meta.media.includes(scheme))?.dataset
    .color;
  if (color !== undefined) {
    for (const meta of metas) {
      meta.content = color;
    }
  }
})();
