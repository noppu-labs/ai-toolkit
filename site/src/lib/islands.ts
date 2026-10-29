/** Astro marks an island `ssr` until its component has hydrated, then removes the attribute. */
const UNHYDRATED_ISLAND = "astro-island[ssr]";

/**
 * Resolves once every Astro island under `root` has hydrated, or after
 * `timeoutMs`, so an island that never hydrates holds nothing up for long.
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
