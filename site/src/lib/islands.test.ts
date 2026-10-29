import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { whenIslandsHydrated } from "./islands.ts";

type State = "resolved" | "pending";

let root: HTMLElement;

beforeEach(() => {
  root = document.body.appendChild(document.createElement("div"));
});

afterEach(() => {
  root.remove();
});

/** Whether `promise` has resolved within `ms` milliseconds; `0` lets pending observers and microtasks run first. */
function stateAfter(promise: Promise<void>, ms = 0): Promise<State> {
  return Promise.race([
    promise.then((): State => "resolved"),
    new Promise<State>((resolve) => {
      window.setTimeout(() => resolve("pending"), ms);
    }),
  ]);
}

/** Adds `count` islands Astro has not hydrated yet to `root`. */
function unhydratedIslands(count: number): HTMLElement[] {
  return Array.from({ length: count }, () => {
    const island = document.createElement("astro-island");
    island.setAttribute("ssr", "");
    return root.appendChild(island);
  });
}

describe("whenIslandsHydrated", () => {
  it("resolves at once when the page has no island", async () => {
    expect(await stateAfter(whenIslandsHydrated())).toBe("resolved");
  });

  it("waits until every island has lost its ssr attribute", async () => {
    const [first, second] = unhydratedIslands(2);
    const hydrated = whenIslandsHydrated(root);

    expect(await stateAfter(hydrated)).toBe("pending");
    first?.removeAttribute("ssr");
    expect(await stateAfter(hydrated)).toBe("pending");
    second?.removeAttribute("ssr");
    expect(await stateAfter(hydrated)).toBe("resolved");
  });

  it("gives up after the timeout when an island never hydrates", async () => {
    unhydratedIslands(1);
    const hydrated = whenIslandsHydrated(root, 50);

    expect(await stateAfter(hydrated)).toBe("pending");
    // Well short of the 3 s default, so the 50 ms passed in is what ended the wait.
    expect(await stateAfter(hydrated, 500)).toBe("resolved");
  });
});
