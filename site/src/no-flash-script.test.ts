import { afterEach, describe, expect, it } from "vitest";
import { THEME_COLORS } from "@/lib/head";
import {
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  type Theme,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import SCRIPT from "./scripts/no-flash.js?raw";

interface Setup {
  /** localStorage contents; `null` makes every read throw, as with storage blocked. */
  storage: Record<string, string> | null;
  osDark: boolean;
}

interface Applied {
  dark: boolean;
  colorScheme: string;
  /** Each theme-color meta's `content` and `data-color`, in document order. */
  themeColors: { content: string; color: string | undefined }[];
}

/** The head the script meets while the page parses: the layout's two theme-color metas. */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}">
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}">
  </head>
  <body></body>
</html>`;

function runScript({ storage, osDark }: Setup): Applied {
  const localStorage = {
    getItem: (key: string): string | null => {
      if (storage === null) {
        throw new DOMException("Storage is blocked", "SecurityError");
      }
      return storage[key] ?? null;
    },
  };
  const matchMedia = (query: string): { matches: boolean } => ({
    matches: query === "(prefers-color-scheme: dark)" && osDark,
  });
  // A fresh, inert page, so each run starts from the metas as the build writes them.
  const doc = new DOMParser().parseFromString(PAGE, "text/html");
  new Function("localStorage", "matchMedia", "document", SCRIPT)(
    localStorage,
    matchMedia,
    doc,
  );
  const root = doc.documentElement;
  return {
    dark: root.classList.contains("dark"),
    colorScheme: root.style.colorScheme,
    themeColors: [
      ...doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
    ].map((meta) => ({ content: meta.content, color: meta.dataset.color })),
  };
}

/** What the preferences store writes for `theme`, so the script is tested against the real format. */
function persisted(theme: Theme): Record<string, string> {
  usePreferencesStore.getState().setTheme(theme);
  const value = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  if (value === null) {
    throw new Error("The store did not persist the theme");
  }
  return { [PREFERENCES_STORAGE_KEY]: value };
}

const LIGHT_COLOR: string = THEME_COLORS.light;
const DARK_COLOR: string = THEME_COLORS.dark;

afterEach(() => {
  resetPreferences();
});

describe("the no-flash script", () => {
  it.each([
    ["dark", false, true],
    ["light", true, false],
    ["system", true, true],
    ["system", false, false],
  ] as const)(
    "applies a stored %s theme (OS dark: %s) as dark: %s",
    (theme, osDark, dark) => {
      expect(runScript({ storage: persisted(theme), osDark })).toMatchObject({
        dark,
        colorScheme: dark ? "dark" : "light",
      });
    },
  );

  it("falls back to the legacy next-themes key", () => {
    expect(
      runScript({ storage: { [LEGACY_THEME_KEY]: "dark" }, osDark: false }),
    ).toMatchObject({ dark: true, colorScheme: "dark" });
    expect(
      runScript({ storage: { [LEGACY_THEME_KEY]: "light" }, osDark: true }),
    ).toMatchObject({ dark: false, colorScheme: "light" });
  });

  it("prefers the store's key over the legacy one", () => {
    const storage = { ...persisted("light"), [LEGACY_THEME_KEY]: "dark" };

    expect(runScript({ storage, osDark: true }).dark).toBe(false);
  });

  it("ignores the legacy key once the store's key exists, even without a theme", () => {
    const storage = {
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({
        state: { installMethod: "skills-cli" },
        version: 1,
      }),
      [LEGACY_THEME_KEY]: "dark",
    };

    expect(runScript({ storage, osDark: false }).dark).toBe(false);
  });

  it.each([
    ["dark", false, DARK_COLOR],
    ["light", true, LIGHT_COLOR],
  ] as const)(
    "points both theme-color metas at a stored %s theme (OS dark: %s)",
    (theme, osDark, color) => {
      expect(
        runScript({ storage: persisted(theme), osDark }).themeColors,
      ).toEqual([
        { content: color, color: LIGHT_COLOR },
        { content: color, color: DARK_COLOR },
      ]);
    },
  );

  it.each([true, false])(
    "follows the OS (dark: %s) with nothing stored",
    (osDark) => {
      expect(runScript({ storage: {}, osDark }).dark).toBe(osDark);
    },
  );

  it.each([
    ["unparsable JSON", { [PREFERENCES_STORAGE_KEY]: "{" }],
    ["blocked storage", null],
  ])("follows the OS when it meets %s", (_case, storage) => {
    expect(runScript({ storage, osDark: true }).dark).toBe(true);
  });
});
