/**
 * `window.matchMedia(query)`. The build prerenders the page in Node, where there is no window:
 * there the list never matches and never fires, so every query takes its default.
 */
export function matchMediaOrNever(query: string): MediaQueryList {
  if (typeof window !== "undefined") {
    return window.matchMedia(query);
  }
  return Object.assign(new EventTarget(), {
    matches: false,
    media: query,
    onchange: null,
    addListener(): void {},
    removeListener(): void {},
  });
}
