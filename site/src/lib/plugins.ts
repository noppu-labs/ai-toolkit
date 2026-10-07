/** `marketplace.json` keeps its own plugin order; the site shows the language-agnostic plugins first. */
export const PLUGIN_ORDER: readonly string[] = [
  "review",
  "investigate",
  "laravel",
  "inertia-react",
];

/** Skills a plugin lists first on the site, in this order; the rest follow alphabetically. */
const LEADING_SKILLS: Readonly<Record<string, readonly string[]>> = {
  // The orchestrator first: it runs the other review skills.
  review: ["pr-review", "comment-audit", "type-safety-review", "pr-comments"],
};

const LANGUAGE_AGNOSTIC_PLUGINS: ReadonlySet<string> = new Set([
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

const COLOR_VARS: Readonly<Record<string, string>> = {
  review: "var(--color-plugin-review)",
  investigate: "var(--color-plugin-investigate)",
  laravel: "var(--color-plugin-laravel)",
  "inertia-react": "var(--color-plugin-inertia-react)",
};

const FALLBACK_COLOR_CLASS = "bg-main";
const FALLBACK_PRESSED_COLOR_CLASS =
  "aria-pressed:bg-main data-pressed:bg-main";

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

/** A plugin's skills in the site order: its leading skills, then the rest by name. */
export function sortSkills<T extends { name: string }>(
  plugin: string,
  skills: readonly T[],
): T[] {
  const leading = LEADING_SKILLS[plugin] ?? [];
  const rank = (name: string): number => {
    const index = leading.indexOf(name);
    return index === -1 ? leading.length : index;
  };
  return [...skills].sort(
    (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
  );
}

export function pluginColorClass(name: string): string {
  return COLOR_CLASSES[name] ?? FALLBACK_COLOR_CLASS;
}

/** The plugin's colour as a CSS value, for styles a utility class cannot name (an accent shadow). */
export function pluginColorVar(name: string): string {
  return COLOR_VARS[name] ?? "var(--color-main)";
}

export function pluginPressedColorClass(name: string): string {
  return PRESSED_COLOR_CLASSES[name] ?? FALLBACK_PRESSED_COLOR_CLASS;
}

export function isLanguageAgnostic(name: string): boolean {
  return LANGUAGE_AGNOSTIC_PLUGINS.has(name);
}
