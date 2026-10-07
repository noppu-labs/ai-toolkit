export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Smooth, unless the visitor asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "instant" : "smooth";
}

/**
 * Scrolls the element with this id to the top of the viewport (its
 * `scroll-margin-top` keeps it clear of the sticky header) and, when it can
 * take focus, focuses it without a second scroll, as following a link would
 * move the reading position. Returns whether the element exists.
 */
export function goToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (target === null) {
    return false;
  }
  target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  if (target.hasAttribute("tabindex")) {
    target.focus({ preventScroll: true });
  }
  return true;
}

/** Scrolls to the top of the page and moves focus to the skip link's target, so the next Tab starts from the content. */
export function goToTop(focusId: string): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  document.getElementById(focusId)?.focus({ preventScroll: true });
}

/** The element id in the URL's fragment, or `null` when there is none. */
export function hashTarget(hash: string): string | null {
  if (hash.length <= 1) {
    return null;
  }
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return hash.slice(1);
  }
}
