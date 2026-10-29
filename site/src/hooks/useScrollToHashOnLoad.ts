import { useEffect } from "react";
import { whenIslandsHydrated } from "@/lib/islands";
import { goToSection, hashTarget } from "@/lib/scroll";

/** The visitor's input that cancels a pending scroll: a tap, a click, a key, the wheel or a new fragment. */
const VISITOR_INPUT = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
  "hashchange",
] as const;

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
 * until Astro has started hydrating every island on the page
 * (`whenIslandsHydrated`), then for the main thread to go idle, since React
 * renders an island after Astro hands it over, and only then scrolls to the
 * target again.
 *
 * That scroll only re-lands the page and leaves focus alone. The browser's own
 * jump has already focused the target if it takes focus, and since then a
 * phone deep link's sheet, or the visitor, may have moved focus elsewhere. The
 * visitor's first tap, click, key, wheel or change of fragment cancels the
 * scroll, which would otherwise undo what they did.
 */
export function useScrollToHashOnLoad(): void {
  useEffect(() => {
    const id = hashTarget(window.location.hash);
    if (id === null) {
      return;
    }
    const input = new AbortController();
    let waiting = true;
    let cancelIdle = (): void => undefined;
    const stopWaiting = (): void => {
      waiting = false;
      cancelIdle();
      input.abort();
    };
    for (const type of VISITOR_INPUT) {
      window.addEventListener(type, stopWaiting, {
        capture: true,
        once: true,
        passive: true,
        signal: input.signal,
      });
    }
    void whenIslandsHydrated().then((): void => {
      if (waiting) {
        cancelIdle = whenIdle((): void => {
          input.abort();
          goToSection(id, { focus: false });
        });
      }
    });
    return stopWaiting;
  }, []);
}
