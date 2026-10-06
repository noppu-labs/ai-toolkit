/**
 * Site-side plugin presentation: display order, accent colours and which
 * plugins work in any language. `marketplace.json` keeps its own order; the
 * site shows the language-agnostic plugins first.
 */

/** The order the site shows plugins in. Unknown plugins follow, in input order. */
export const PLUGIN_ORDER: readonly string[] = [
  "review",
  "investigate",
  "laravel",
  "inertia-react",
];

/** Plugins that are not tied to one language or framework. */
export const LANGUAGE_AGNOSTIC_PLUGINS: ReadonlySet<string> = new Set([
  "review",
  "investigate",
]);

// Full literal class strings, so Tailwind's scanner generates every one.
const COLOR_CLASSES: Readonly<Record<string, string>> = {
  review: "bg-plugin-review",
  investigate: "bg-plugin-investigate",
  laravel: "bg-plugin-laravel",
  "inertia-react": "bg-plugin-inertia-react",
};

const PRESSED_COLOR_CLASSES: Readonly<Record<string, string>> = {
  review: "aria-pressed:bg-plugin-review data-pressed:bg-plugin-review",
  investigate:
    "aria-pressed:bg-plugin-investigate data-pressed:bg-plugin-investigate",
  laravel: "aria-pressed:bg-plugin-laravel data-pressed:bg-plugin-laravel",
  "inertia-react":
    "aria-pressed:bg-plugin-inertia-react data-pressed:bg-plugin-inertia-react",
};

const FALLBACK_COLOR_CLASS = "bg-main";
const FALLBACK_PRESSED_COLOR_CLASS =
  "aria-pressed:bg-main data-pressed:bg-main";

/**
 * Returns the plugins with the known names first, in `PLUGIN_ORDER`, and any
 * others after them in their original order. The input is not mutated.
 */
export function sortPlugins<T extends { name: string }>(
  plugins: readonly T[],
): T[] {
  const rank = (name: string): number => {
    const index = PLUGIN_ORDER.indexOf(name);
    return index === -1 ? PLUGIN_ORDER.length : index;
  };
  // Array.prototype.sort is stable, so unknown plugins keep their order.
  return [...plugins].sort((a, b) => rank(a.name) - rank(b.name));
}

/** The background class for a plugin's accent colour (`bg-main` if unknown). */
export function pluginColorClass(name: string): string {
  return COLOR_CLASSES[name] ?? FALLBACK_COLOR_CLASS;
}

/** The accent background for a pressed toggle (`bg-main` if unknown). */
export function pluginPressedColorClass(name: string): string {
  return PRESSED_COLOR_CLASSES[name] ?? FALLBACK_PRESSED_COLOR_CLASS;
}

/** Whether a plugin works across languages rather than for one stack. */
export function isLanguageAgnostic(name: string): boolean {
  return LANGUAGE_AGNOSTIC_PLUGINS.has(name);
}
