import { vi } from "vitest";
import { PREFERS_DARK_QUERY } from "@/lib/theme";
import {
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";

/** Puts the preferences store back to its defaults and clears what it stored. */
export function resetPreferences(): void {
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  localStorage.removeItem(PREFERENCES_STORAGE_KEY);
  localStorage.removeItem(LEGACY_THEME_KEY);
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
}

export interface SystemTheme {
  /** Flips the OS setting and notifies `change` listeners, as the browser would. */
  setDark: (dark: boolean) => void;
}

/** Stubs `matchMedia` so the OS colour scheme is `dark` (or light) until `setDark` changes it. Undo with `vi.restoreAllMocks()`. */
export function stubSystemTheme(dark: boolean): SystemTheme {
  let matches = dark;
  const listeners = new Set<() => void>();
  const original = window.matchMedia.bind(window);

  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    if (query !== PREFERS_DARK_QUERY) {
      return original(query);
    }
    return {
      get matches(): boolean {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void): void => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void): void => {
        listeners.delete(listener);
      },
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      dispatchEvent: (): boolean => true,
    } as unknown as MediaQueryList;
  });

  return {
    setDark: (next: boolean): void => {
      matches = next;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
