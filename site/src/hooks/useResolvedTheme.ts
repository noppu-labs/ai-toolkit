import { useSyncExternalStore } from "react";
import {
  prefersDarkQuery,
  type ResolvedTheme,
  systemPrefersDark,
} from "@/lib/theme";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

function subscribeToSystemTheme(onChange: () => void): () => void {
  prefersDarkQuery.addEventListener("change", onChange);
  return (): void => prefersDarkQuery.removeEventListener("change", onChange);
}

function subscribeToNothing(): () => void {
  return (): void => undefined;
}

export function useResolvedTheme(): ResolvedTheme {
  const theme = usePreferencesStore((state) => state.theme);
  const prefersDark = useSyncExternalStore(
    theme === "system" ? subscribeToSystemTheme : subscribeToNothing,
    systemPrefersDark,
  );
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }
  return theme;
}
