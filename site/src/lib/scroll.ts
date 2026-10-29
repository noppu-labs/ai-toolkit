import { matchMediaOrNever } from "./media.ts";

export const prefersReducedMotionQuery: MediaQueryList = matchMediaOrNever(
  "(prefers-reduced-motion: reduce)",
);

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotionQuery.matches ? "instant" : "smooth";
}

export interface GoToSectionOptions {
  /** Whether a target with a `tabindex` takes focus. Defaults to `true`. */
  focus?: boolean;
}

/**
 * `scroll-margin-top` keeps the target clear of the sticky header. A target with a
 * `tabindex` also takes focus, as following a link would, without a second scroll,
 * unless `focus` is `false`. Returns `false` when no element has this id.
 */
export function goToSection(
  id: string,
  { focus = true }: GoToSectionOptions = {},
): boolean {
  const target = document.getElementById(id);
  if (target === null) {
    return false;
  }
  target.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  if (focus && target.hasAttribute("tabindex")) {
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
