import { useEffect } from "react";
import { goToSection, hashTarget } from "@/lib/scroll";

/**
 * The browser looks for a URL fragment's target (`/#skills`) before React has
 * rendered it, so the page would open at the top. Once the app is on screen,
 * this scrolls to the target instead.
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
