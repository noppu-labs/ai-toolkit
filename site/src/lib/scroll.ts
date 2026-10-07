export const prefersReducedMotionQuery: MediaQueryList = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotionQuery.matches ? "instant" : "smooth";
}

/**
 * `scroll-margin-top` keeps the target clear of the sticky header. A target with a
 * `tabindex` also takes focus, as following a link would, without a second scroll.
 * Returns `false` when no element has this id.
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

/** Also moves focus to `focusId`, so the next Tab starts there rather than where focus was. */
export function goToTop(focusId: string): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
  document.getElementById(focusId)?.focus({ preventScroll: true });
}

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
