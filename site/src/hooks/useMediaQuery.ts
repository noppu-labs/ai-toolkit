import { useCallback, useSyncExternalStore } from "react";

/** Whether the media query matches, followed live as the window resizes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void): (() => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return (): void => list.removeEventListener("change", onChange);
    },
    [query],
  );
  const read = useCallback(
    (): boolean => window.matchMedia(query).matches,
    [query],
  );
  return useSyncExternalStore(subscribe, read);
}
