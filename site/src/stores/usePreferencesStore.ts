import { create } from "zustand";
import {
  createJSONStorage,
  devtools,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { systemPrefersDark } from "@/lib/theme";

export type Theme = "light" | "dark" | "system";
export type InstallMethod = "claude-code" | "skills-cli";

interface PreferencesState {
  theme: Theme;
  installMethod: InstallMethod;
}

interface PreferencesActions {
  setTheme: (theme: Theme) => void;
  /** Switches to the opposite of the theme on screen, resolving `system` against the OS. */
  toggleTheme: () => void;
  setInstallMethod: (installMethod: InstallMethod) => void;
}

type PreferencesStore = PreferencesState & PreferencesActions;

/** Also read by the no-flash script in `index.html`; keep the two in step. */
export const PREFERENCES_STORAGE_KEY = "ai-toolkit-preferences";
/** Where next-themes kept the theme before this store replaced it. */
export const LEGACY_THEME_KEY = "theme";
const STORAGE_VERSION = 1;

const DEFAULT_PREFERENCES: PreferencesState = {
  theme: "system",
  installMethod: "claude-code",
};

const THEMES: readonly Theme[] = ["light", "dark", "system"];
const INSTALL_METHODS: readonly InstallMethod[] = ["claude-code", "skills-cli"];

function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

function isInstallMethod(value: unknown): value is InstallMethod {
  return INSTALL_METHODS.includes(value as InstallMethod);
}

/** Keeps only valid preference values, so a hand-edited or stale entry cannot break the page. */
function sanitize(persisted: unknown): Partial<PreferencesState> {
  const { theme, installMethod } = (persisted ?? {}) as Record<string, unknown>;
  return {
    ...(isTheme(theme) && { theme }),
    ...(isInstallMethod(installMethod) && { installMethod }),
  };
}

// localStorage that never throws (it can in sandboxed iframes or with storage
// blocked) and that, until the new key is first written, offers the legacy
// next-themes value as a version-0 entry, so `migrate` adopts it once.
const preferencesStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      const stored = localStorage.getItem(name);
      const legacy = localStorage.getItem(LEGACY_THEME_KEY);
      if (stored !== null || legacy === null) {
        return stored;
      }
      return JSON.stringify({ state: { theme: legacy }, version: 0 });
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
      localStorage.removeItem(LEGACY_THEME_KEY);
    } catch {
      // Preferences then last for this visit only.
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Nothing stored to remove.
    }
  },
};

export const usePreferencesStore = create<PreferencesStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...DEFAULT_PREFERENCES,

        setTheme: (theme: Theme): void => {
          set({ theme }, false, "preferences/setTheme");
        },
        toggleTheme: (): void => {
          const { theme } = get();
          const isDark =
            theme === "dark" || (theme === "system" && systemPrefersDark());
          set(
            { theme: isDark ? "light" : "dark" },
            false,
            "preferences/toggleTheme",
          );
        },
        setInstallMethod: (installMethod: InstallMethod): void => {
          set({ installMethod }, false, "preferences/setInstallMethod");
        },
      }),
      {
        name: PREFERENCES_STORAGE_KEY,
        version: STORAGE_VERSION,
        storage: createJSONStorage(() => preferencesStorage),
        partialize: ({
          theme,
          installMethod,
        }: PreferencesStore): PreferencesState => ({
          theme,
          installMethod,
        }),
        // Version 0 is the legacy next-themes value; sanitize drops anything unknown.
        migrate: (persisted: unknown): PreferencesState => ({
          ...DEFAULT_PREFERENCES,
          ...sanitize(persisted),
        }),
        merge: (
          persisted: unknown,
          current: PreferencesStore,
        ): PreferencesStore => ({
          ...current,
          ...sanitize(persisted),
        }),
      },
    ),
    { name: "Preferences", enabled: import.meta.env.DEV },
  ),
);
