/**
 * Astro marks an island `ssr` until it hands the component to React, then
 * removes the attribute. React hydrates the island after that, in a transition.
 */
const UNHYDRATED_ISLAND = "astro-island[ssr]";

/**
 * Resolves once Astro has started hydrating every island under `root`, or
 * after `timeoutMs`, so an island that never hydrates holds nothing up for
 * long. React may still be rendering the islands then: `useScrollToHashOnLoad`
 * also waits for the main thread to go idle.
 */
export function whenIslandsHydrated(
  root: ParentNode = document,
  timeoutMs = 3000,
): Promise<void> {
  if (root.querySelector(UNHYDRATED_ISLAND) === null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const observer = new MutationObserver((): void => {
      if (root.querySelector(UNHYDRATED_ISLAND) === null) {
        finish();
      }
    });
    const timer = window.setTimeout(finish, timeoutMs);
    function finish(): void {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve();
    }
    observer.observe(root, {
      attributeFilter: ["ssr"],
      subtree: true,
    });
  });
}
