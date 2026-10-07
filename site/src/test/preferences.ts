import { prefersDarkQuery } from "@/lib/theme";
import {
  LEGACY_THEME_KEY,
  PREFERENCES_STORAGE_KEY,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";
import { stubMediaQuery } from "@/test/media";

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

/** Undo with `vi.restoreAllMocks()`. */
export function stubSystemTheme(dark: boolean): SystemTheme {
  const query = stubMediaQuery(prefersDarkQuery, dark);
  return { setDark: query.set };
}
