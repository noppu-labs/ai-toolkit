import { useEffect } from "react";
import { whenIslandsHydrated } from "@/lib/islands";
import { goToSection, hashTarget } from "@/lib/scroll";

/**
 * Calls `callback` once the main thread is idle; returns a cancel. Browsers
 * without `requestIdleCallback` wait 200 ms instead, as Astro's `client:idle` does.
 */
function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback);
    return (): void => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(callback, 200);
  return (): void => window.clearTimeout(timer);
}

/**
 * The browser jumps to a URL fragment's target (`/#skills`) in the prerendered
 * page, but hydration then moves it: the catalog collapses its long groups, and
 * islands that hydrate later, on idle, can change height (a saved skills CLI
 * preference shortens the install section and the plugin cards). So this waits
 * until every island on the page has hydrated (`whenIslandsHydrated`), then for
 * the main thread to go idle, since Astro marks an island hydrated as soon as
 * React starts on it, and only then scrolls to the target again.
 */
export function useScrollToHashOnLoad(): void {
  useEffect(() => {
    const id = hashTarget(window.location.hash);
    if (id === null) {
      return;
    }
    let mounted = true;
    let cancelIdle = (): void => undefined;
    void whenIslandsHydrated().then((): void => {
      if (mounted) {
        cancelIdle = whenIdle(() => goToSection(id));
      }
    });
    return (): void => {
      mounted = false;
      cancelIdle();
    };
  }, []);
}
