import { afterEach, describe, expect, it } from "vitest";
import {
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  type Theme,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";
import { resetPreferences } from "@/test/preferences";
import indexHtml from "../index.html?raw";

interface Setup {
  /** localStorage contents; `null` makes every read throw, as with storage blocked. */
  storage: Record<string, string> | null;
  osDark: boolean;
}

interface Applied {
  dark: boolean;
  colorScheme: string;
}

const SCRIPT: string = (() => {
  const doc = new DOMParser().parseFromString(indexHtml, "text/html");
  const inline = [...doc.querySelectorAll("script:not([src])")];
  if (inline.length !== 1 || inline[0] === undefined) {
    throw new Error(
      `Expected one inline script in index.html, found ${inline.length}`,
    );
  }
  return inline[0].textContent;
})();

/** Runs index.html's inline script against stubbed globals and reports what it applied to `<html>`. */
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
  const root = document.createElement("html");
  new Function("localStorage", "matchMedia", "document", SCRIPT)(
    localStorage,
    matchMedia,
    { documentElement: root },
  );
  return {
    dark: root.classList.contains("dark"),
    colorScheme: root.style.colorScheme,
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

afterEach(() => {
  resetPreferences();
});

describe("index.html no-flash script", () => {
  it.each([
    ["dark", false, true],
    ["light", true, false],
    ["system", true, true],
    ["system", false, false],
  ] as const)(
    "applies a stored %s theme (OS dark: %s) as dark: %s",
    (theme, osDark, dark) => {
      expect(runScript({ storage: persisted(theme), osDark })).toEqual({
        dark,
        colorScheme: dark ? "dark" : "light",
      });
    },
  );

  it("falls back to the legacy next-themes key", () => {
    expect(
      runScript({ storage: { [LEGACY_THEME_KEY]: "dark" }, osDark: false }),
    ).toEqual({ dark: true, colorScheme: "dark" });
    expect(
      runScript({ storage: { [LEGACY_THEME_KEY]: "light" }, osDark: true }),
    ).toEqual({ dark: false, colorScheme: "light" });
  });

  it("prefers the store's key over the legacy one", () => {
    const storage = { ...persisted("light"), [LEGACY_THEME_KEY]: "dark" };

    expect(runScript({ storage, osDark: true }).dark).toBe(false);
  });

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
