import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import {
  type ConsentChoice,
  getConsentChoice,
  isAnalyticsHost,
  recordConsent,
  startAnalytics,
  stopAnalytics,
} from "@/lib/analytics";
import { PRIVACY_PATH } from "@/lib/site";
import { useConsentStore } from "@/stores/useConsentStore";

function getCurrentChoiceText(choice: ConsentChoice | null): string {
  if (choice === null) {
    return "You haven't chosen yet.";
  }

  return choice === "granted"
    ? "Analytics is on for you."
    : "Analytics is off for you.";
}

function handleAllow(): void {
  recordConsent("granted");
  useConsentStore.getState().closePanel();
}

function handleDecline(): void {
  recordConsent("denied");
  useConsentStore.getState().closePanel();
}

/** Only the settings the visitor opened can be dismissed: the prompt still needs an answer. */
function handleKeyDown(event: KeyboardEvent): void {
  const { panel, closePanel } = useConsentStore.getState();
  if (event.key === "Escape" && panel === "settings") {
    closePanel();
  }
}

function stopUnlessAllowed(): void {
  if (getConsentChoice(document.cookie) !== "granted") {
    stopAnalytics();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    stopUnlessAllowed();
  }
}

/**
 * Asks once, on production, before Google's tag may load; returning visitors who allowed it
 * start the tag here. Renders nothing at build time, so a visitor without JavaScript sees no
 * banner and loads no tag.
 */
export function ConsentBanner(): ReactElement | null {
  const panel = useConsentStore((state) => state.panel);
  const headingId = useId();
  const banner = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAnalyticsHost(window.location.hostname)) {
      return;
    }
    const choice = getConsentChoice(document.cookie);
    if (choice === "granted") {
      startAnalytics();
    } else {
      stopAnalytics();
    }
    // A Cookie settings click can beat this island's hydration.
    const { panel: current, openPrompt } = useConsentStore.getState();
    if (choice === null && current === "closed") {
      openPrompt();
    }

    // The answer can change in another tab, or on another page before the visitor goes Back.
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", stopUnlessAllowed);

    return (): void => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", stopUnlessAllowed);
    };
  }, []);

  useEffect(() => {
    if (panel !== "settings") {
      return;
    }
    const opener = document.activeElement;
    banner.current?.focus();

    return (): void => {
      if (opener instanceof HTMLElement) {
        opener.focus();
      }
    };
  }, [panel]);

  if (panel === "closed") {
    return null;
  }

  return (
    <section
      aria-labelledby={headingId}
      className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-base border-2 border-edge bg-secondary-background p-4 text-foreground shadow-shadow outline-hidden md:right-6 md:bottom-6 md:left-auto md:max-w-md md:p-5 print:hidden"
      onKeyDown={handleKeyDown}
      ref={banner}
      tabIndex={-1}
    >
      <h2 className="text-xl tracking-[-0.02em]" id={headingId}>
        {panel === "prompt"
          ? "Mind if we count this visit?"
          : "Cookie settings"}
      </h2>
      <p className="text-sm leading-normal text-muted-foreground">
        Google Analytics would set cookies that show which pages get read and
        where visitors come from. It stays off unless you allow it.{" "}
        {panel === "settings" && (
          <strong className="text-foreground">
            {getCurrentChoiceText(getConsentChoice(document.cookie))}{" "}
          </strong>
        )}
        <a
          className="rounded-sm font-bold text-foreground underline underline-offset-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background focus-visible:outline-hidden"
          href={PRIVACY_PATH}
        >
          Read the privacy page
        </a>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handleAllow} variant="default">
          Allow analytics
        </Button>
        <Button onClick={handleDecline} variant="neutral">
          No thanks
        </Button>
      </div>
    </section>
  );
}
