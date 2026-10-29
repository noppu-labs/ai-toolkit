import { useEffect } from "react";
import { goToSection, hashTarget } from "@/lib/scroll";

/**
 * The browser jumps to a URL fragment's target (`/#skills`) in the prerendered
 * page, which the app then replaces, and the catalog collapsing its long groups
 * moves what sits below it. Once the app is on screen, this scrolls to the
 * target again.
 */
export function useScrollToHashOnLoad(): void {
  useEffect(() => {
    const id = hashTarget(window.location.hash);
    if (id === null) {
      return;
    }
    // A frame later, so layout (and the header's scroll margin) has settled.
    const frame = window.requestAnimationFrame(() => {
      goToSection(id);
    });
    return (): void => window.cancelAnimationFrame(frame);
  }, []);
}
