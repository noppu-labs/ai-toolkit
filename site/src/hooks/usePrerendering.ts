import { useSyncExternalStore } from "react";

function subscribeToNothing(): () => void {
  return (): void => undefined;
}

/**
 * True only while the build renders the page in Node. A browser always gets `false`:
 * `main.tsx` renders the app afresh rather than hydrating the prerendered markup.
 */
export function usePrerendering(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    (): boolean => false,
    (): boolean => true,
  );
}
