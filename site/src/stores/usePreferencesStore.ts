import { create } from "zustand";
import {
  createJSONStorage,
  devtools,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { RESOLVED_THEMES, systemPrefersDark } from "@/lib/theme";

const THEMES = [...RESOLVED_THEMES, "system"] as const;
export type Theme = (typeof THEMES)[number];

export const INSTALL_METHODS = ["claude-code", "skills-cli"] as const;
export type InstallMethod = (typeof INSTALL_METHODS)[number];

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
/** The key next-themes stored the theme under; `migrateLegacyTheme` adopts it once, then removes it. */
export const LEGACY_THEME_KEY = "theme";
const STORAGE_VERSION = 1;

const DEFAULT_PREFERENCES: PreferencesState = {
  theme: "system",
  installMethod: "claude-code",
};

function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

export function isInstallMethod(value: unknown): value is InstallMethod {
  return INSTALL_METHODS.some((method) => method === value);
}

/** Keeps only valid preference values, so a hand-edited or stale entry cannot break the page. */
function sanitize(persisted: unknown): Partial<PreferencesState> {
  if (typeof persisted !== "object" || persisted === null) {
    return {};
  }
  const theme = "theme" in persisted ? persisted.theme : undefined;
  const installMethod =
    "installMethod" in persisted ? persisted.installMethod : undefined;

  return {
    ...(isTheme(theme) && { theme }),
    ...(isInstallMethod(installMethod) && { installMethod }),
  };
}

/** Does nothing once the store's key exists, so later writes leave any new `theme` value alone. */
export function migrateLegacyTheme(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_THEME_KEY);
    if (
      legacy === null ||
      localStorage.getItem(PREFERENCES_STORAGE_KEY) !== null
    ) {
      return;
    }
    if (isTheme(legacy)) {
      localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          state: { ...DEFAULT_PREFERENCES, theme: legacy },
          version: STORAGE_VERSION,
        }),
      );
    }
    localStorage.removeItem(LEGACY_THEME_KEY);
  } catch {
    // Storage is blocked, so there is nothing to migrate.
  }
}

// localStorage that never throws (it can in sandboxed iframes or with storage blocked).
const preferencesStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value);
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

migrateLegacyTheme();

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

// Another tab changed the preferences: adopt them, so this tab neither lags nor
// overwrites them with its own stale state on its next write.
window.addEventListener("storage", (event: StorageEvent): void => {
  if (event.key === PREFERENCES_STORAGE_KEY) {
    void usePreferencesStore.persist.rehydrate();
  }
});
