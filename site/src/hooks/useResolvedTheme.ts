import { useSyncExternalStore } from "react";
import {
  PREFERS_DARK_QUERY,
  type ResolvedTheme,
  systemPrefersDark,
} from "@/lib/theme";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(PREFERS_DARK_QUERY);
  query.addEventListener("change", onChange);
  return (): void => query.removeEventListener("change", onChange);
}

/** The theme on screen: the stored choice, or the OS setting (followed live) while that choice is `system`. */
export function useResolvedTheme(): ResolvedTheme {
  const theme = usePreferencesStore((state) => state.theme);
  const prefersDark = useSyncExternalStore(
    subscribeToSystemTheme,
    systemPrefersDark,
  );
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return theme;
}
