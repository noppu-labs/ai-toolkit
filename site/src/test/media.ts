import { vi } from "vitest";

export interface MediaQueryStub {
  /** Flips the result and notifies `change` listeners, as the browser would. */
  set: (matches: boolean) => void;
}

/**
 * Stubs `matches` on one of the page's module-level `MediaQueryList`s, which
 * keeps its real listener methods. Undo with `vi.restoreAllMocks()`.
 */
export function stubMediaQuery(
  query: MediaQueryList,
  initial: boolean,
): MediaQueryStub {
  let matches = initial;
  vi.spyOn(query, "matches", "get").mockImplementation(() => matches);

  return {
    set: (next: boolean): void => {
      matches = next;
      query.dispatchEvent(new Event("change"));
    },
  };
}
