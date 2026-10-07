import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPreferences, stubSystemTheme } from "@/test/preferences";
import {
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  usePreferencesStore,
} from "./usePreferencesStore.ts";

function stored(): unknown {
  const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(() => {
  resetPreferences();
});

afterEach(() => {
  resetPreferences();
  vi.restoreAllMocks();
});

describe("usePreferencesStore", () => {
  it("defaults to the system theme and the Claude Code install method", () => {
    const { theme, installMethod } = usePreferencesStore.getState();

    expect({ theme, installMethod }).toEqual({
      theme: "system",
      installMethod: "claude-code",
    });
  });

  it("sets the theme and the install method", () => {
    usePreferencesStore.getState().setTheme("dark");
    usePreferencesStore.getState().setInstallMethod("skills-cli");

    const { theme, installMethod } = usePreferencesStore.getState();
    expect({ theme, installMethod }).toEqual({
      theme: "dark",
      installMethod: "skills-cli",
    });
  });

  it("toggles between light and dark", () => {
    usePreferencesStore.getState().setTheme("light");

    usePreferencesStore.getState().toggleTheme();
    expect(usePreferencesStore.getState().theme).toBe("dark");

    usePreferencesStore.getState().toggleTheme();
    expect(usePreferencesStore.getState().theme).toBe("light");
  });

  it.each([
    [true, "light"],
    [false, "dark"],
  ] as const)(
    "toggles away from the system theme (OS dark: %s) to %s",
    (osDark, expected) => {
      stubSystemTheme(osDark);

      usePreferencesStore.getState().toggleTheme();

      expect(usePreferencesStore.getState().theme).toBe(expected);
    },
  );

  it("persists only the theme and the install method, under a versioned key", () => {
    usePreferencesStore.getState().setTheme("light");
    usePreferencesStore.getState().setInstallMethod("skills-cli");

    expect(stored()).toEqual({
      state: { theme: "light", installMethod: "skills-cli" },
      version: 1,
    });
  });

  it("restores persisted preferences on rehydration", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { theme: "dark", installMethod: "skills-cli" },
        version: 1,
      }),
    );

    await usePreferencesStore.persist.rehydrate();

    const { theme, installMethod } = usePreferencesStore.getState();
    expect({ theme, installMethod }).toEqual({
      theme: "dark",
      installMethod: "skills-cli",
    });
  });

  it("ignores unknown persisted values", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { theme: "sepia", installMethod: 42, extra: true },
        version: 1,
      }),
    );

    await usePreferencesStore.persist.rehydrate();

    const state = usePreferencesStore.getState();
    expect(state.theme).toBe("system");
    expect(state.installMethod).toBe("claude-code");
    expect(state).not.toHaveProperty("extra");
  });

  it("migrates the legacy next-themes value once, then drops the old key", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "dark");

    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState().theme).toBe("dark");
    expect(stored()).toEqual({
      state: { theme: "dark", installMethod: "claude-code" },
      version: 1,
    });
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
  });

  it("prefers the new key over a leftover legacy value", async () => {
    localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({
        state: { theme: "light", installMethod: "claude-code" },
        version: 1,
      }),
    );
    localStorage.setItem(LEGACY_THEME_KEY, "dark");

    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState().theme).toBe("light");
  });

  it("drops an unknown legacy value", async () => {
    localStorage.setItem(LEGACY_THEME_KEY, "sepia");

    await usePreferencesStore.persist.rehydrate();

    expect(usePreferencesStore.getState().theme).toBe("system");
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
  });
});
