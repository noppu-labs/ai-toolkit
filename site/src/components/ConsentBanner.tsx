import { X } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import {
  type ConsentMode,
  fetchConsentMode,
  recordConsent,
  shouldMeasure,
  startAnalytics,
  stopAnalytics,
} from "@/lib/analytics";
import { PRIVACY_PATH } from "@/lib/site";
import { type ConsentPanel, useConsentStore } from "@/stores/useConsentStore";
import {
  type ConsentChoice,
  getConsentChoice,
  isAnalyticsHost,
} from "../../worker/consent-cookie.ts";

interface PanelText {
  heading: string;
  description: string;
  allow: string;
  decline: string;
}

/** Visitors who are asked first get a question; everyone else is told analytics runs. */
function getPanelText(
  panel: ConsentPanel,
  mode: ConsentMode | null,
): PanelText {
  const asksFirst = mode !== "opt-out";
  const description = asksFirst
    ? "Google Analytics would set cookies that show which pages get read and where visitors come from. It stays off unless you allow it."
    : "Google Analytics sets cookies that show which pages get read and where visitors come from. It runs unless you opt out.";
  if (panel === "settings") {
    return {
      heading: "Cookie settings",
      description,
      allow: "Allow analytics",
      decline: "No thanks",
    };
  }

  return asksFirst
    ? {
        heading: "Mind if we count this visit?",
        description,
        allow: "Allow analytics",
        decline: "No thanks",
      }
    : {
        heading: "We count visits",
        description,
        allow: "Got it",
        decline: "Opt out",
      };
}

function getCurrentChoiceText(
  choice: ConsentChoice | null,
  mode: ConsentMode | null,
): string {
  if (shouldMeasure(choice, mode) === true) {
    return "Analytics is on for you.";
  }

  return choice === null
    ? "You haven't chosen yet."
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

function handleClose(): void {
  useConsentStore.getState().closePanel();
}

/** Only the settings the visitor opened can be dismissed: the prompt still needs an answer. */
function handleKeyDown(event: KeyboardEvent): void {
  const { panel, closePanel } = useConsentStore.getState();
  if (event.key === "Escape" && panel === "settings") {
    closePanel();
  }
}

/**
 * The answer can change in another tab, or on another page before the visitor goes Back.
 * Without an answer nothing changes until the mode is known: an opted-out region's visitor
 * keeps Google's cookies, which deleting early would turn into a new visitor on every page.
 */
function syncWithAnswer(): void {
  const choice = getConsentChoice(document.cookie);
  const { panel, mode, closePanel } = useConsentStore.getState();
  const measure = shouldMeasure(choice, mode);
  if (measure === true) {
    startAnalytics();
  } else if (measure === false) {
    stopAnalytics();
  }

  if (choice !== null && panel === "prompt") {
    closePanel();
  }
}

function applyMode(mode: ConsentMode): void {
  useConsentStore.getState().setMode(mode);
  syncWithAnswer();
  // A Cookie settings click can beat this island's hydration and the Worker's answer.
  const { panel, openPrompt } = useConsentStore.getState();
  if (getConsentChoice(document.cookie) === null && panel === "closed") {
    openPrompt();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    syncWithAnswer();
  }
}

/**
 * On production, asks visitors in an opt-in region before Google's tag may load, and tells
 * everyone else it runs, with a way to opt out. Returning visitors who allowed it start the tag
 * here. Renders nothing at build time, so a visitor without JavaScript sees no banner and loads
 * no tag.
 */
export function ConsentBanner(): ReactElement | null {
  const panel = useConsentStore((state) => state.panel);
  const mode = useConsentStore((state) => state.mode);
  const headingId = useId();
  const banner = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isAnalyticsHost(window.location.hostname)) {
      return;
    }
    let isMounted = true;
    syncWithAnswer();
    // fetchConsentMode never rejects: every failure resolves to opt-in.
    void fetchConsentMode().then((resolved) => {
      if (isMounted) {
        applyMode(resolved);
      }
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", syncWithAnswer);

    return (): void => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", syncWithAnswer);
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
  const text = getPanelText(panel, mode);

  return (
    <section
      aria-labelledby={headingId}
      className="fixed inset-x-4 bottom-4 z-40 flex flex-col gap-3 rounded-base border-2 border-edge bg-secondary-background p-4 text-foreground shadow-shadow outline-hidden md:right-6 md:bottom-6 md:left-auto md:max-w-md md:p-5 print:hidden"
      onKeyDown={handleKeyDown}
      ref={banner}
      tabIndex={-1}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl tracking-[-0.02em]" id={headingId}>
          {text.heading}
        </h2>
        {panel === "settings" && (
          <Button
            aria-label="Close"
            onClick={handleClose}
            size="icon-xs"
            variant="neutral"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="text-sm leading-normal text-muted-foreground">
        {text.description} Your answer applies on noppu.com too.{" "}
        {panel === "settings" && (
          <strong className="text-foreground">
            {getCurrentChoiceText(getConsentChoice(document.cookie), mode)}{" "}
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
        <Button onClick={handleAllow} variant="neutral">
          {text.allow}
        </Button>
        <Button onClick={handleDecline} variant="neutral">
          {text.decline}
        </Button>
      </div>
    </section>
  );
}
