import { useSyncExternalStore } from "react";

function subscribeToNothing(): () => void {
  return (): void => undefined;
}

/**
 * True while the build renders the page in Node, and while the browser
 * hydrates an island, whose first render must match the build's markup; false
 * in every render after that.
 */
export function usePrerendering(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    (): boolean => false,
    (): boolean => true,
  );
}
