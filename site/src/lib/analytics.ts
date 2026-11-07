import {
  type ConsentChoice,
  isAnalyticsHost,
  makeConsentCookie,
  SHARED_COOKIE_DOMAIN,
} from "../../worker/consent-cookie.ts";
import type { ConsentMode } from "../../worker/consent-mode.ts";

export type { ConsentChoice } from "../../worker/consent-cookie.ts";
export type { ConsentMode } from "../../worker/consent-mode.ts";

declare global {
  interface Window {
    dataLayer?: IArguments[];
  }
}

/** Public by design: Google's tag URL carries it in every visitor's browser. */
const MEASUREMENT_ID = "G-MHP3L2JTTP";
const TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
const DISABLE_FLAG = `ga-disable-${MEASUREMENT_ID}`;

const CONSENT_MODE_PATH = "/api/consent-mode";
const CONSENT_PATH = "/api/consent";
const CONSENT_MODE_TIMEOUT_MS = 3000;

function getCookieNames(cookies: string): string[] {
  return cookies
    .split("; ")
    .map((cookie) => cookie.split("=", 1)[0] ?? "")
    .filter((name) => name !== "");
}

/** Global Privacy Control, which Brave, DuckDuckGo and Firefox can send. */
export function hasPrivacySignal(): boolean {
  return Reflect.get(navigator, "globalPrivacyControl") === true;
}

export function parseConsentMode(body: unknown): ConsentMode {
  const mode: unknown =
    typeof body === "object" && body !== null
      ? Reflect.get(body, "mode")
      : undefined;

  return mode === "opt-out" ? "opt-out" : "opt-in";
}

/**
 * Whether this visitor is asked before analytics starts (`opt-in`) or told it runs and may opt
 * out (`opt-out`). The Worker decides from the visitor's country; anything that goes wrong
 * asks first, and so does a privacy signal.
 */
export async function fetchConsentMode(): Promise<ConsentMode> {
  if (hasPrivacySignal()) {
    return "opt-in";
  }
  try {
    const response = await fetch(CONSENT_MODE_PATH, {
      signal: AbortSignal.timeout(CONSENT_MODE_TIMEOUT_MS),
    });

    return response.ok ? parseConsentMode(await response.json()) : "opt-in";
  } catch {
    return "opt-in";
  }
}

/**
 * Asks the Worker to set the consent cookie too: Safari caps cookies written by a script at
 * seven days, and only a cookie set in an HTTP response lasts the full year. Any failure is
 * swallowed, because the cookie the script already wrote carries the choice meanwhile.
 */
export async function sendConsent(choice: ConsentChoice): Promise<void> {
  try {
    await fetch(CONSENT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
      keepalive: true,
      signal: AbortSignal.timeout(CONSENT_MODE_TIMEOUT_MS),
    });
  } catch {
    // Nothing to do: see above.
  }
}

/** Whether analytics should run for this visitor now, or null until the mode is known. */
export function shouldMeasure(
  choice: ConsentChoice | null,
  mode: ConsentMode | null,
): boolean | null {
  if (choice !== null) {
    return choice === "granted";
  }

  return mode === null ? null : mode === "opt-out";
}

/** Clears `_ga` and `_ga_<container>`, which Google's tag sets on the shared domain. */
export function makeExpiredGaCookies(cookies: string): string[] {
  return getCookieNames(cookies)
    .filter((name) => /^_ga(_|$)/.test(name))
    .map(
      (name) => `${name}=; Path=/; Max-Age=0; Domain=${SHARED_COOKIE_DOMAIN}`,
    );
}

// Google's tag only reads `arguments` objects from the queue, not arrays.
function gtag(..._command: unknown[]): void {
  window.dataLayer ??= [];
  // biome-ignore lint/complexity/noArguments: see above.
  window.dataLayer.push(arguments);
}

function hasTag(): boolean {
  return document.querySelector(`script[src="${TAG_URL}"]`) !== null;
}

function isRunning(): boolean {
  return hasTag() && Reflect.get(window, DISABLE_FLAG) === false;
}

/**
 * Basic consent mode: the tag loads only after the visitor allows it, so a visitor who
 * declines sends Google nothing. The ad settings stay denied: the site runs no ads.
 */
export function startAnalytics(): void {
  if (!isAnalyticsHost(window.location.hostname) || isRunning()) {
    return;
  }
  Reflect.set(window, DISABLE_FLAG, false);
  if (hasTag()) {
    gtag("consent", "update", { analytics_storage: "granted" });

    return;
  }
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
  });
  gtag("consent", "update", { analytics_storage: "granted" });
  gtag("js", new Date());
  gtag("config", MEASUREMENT_ID);

  const tag = document.createElement("script");
  tag.async = true;
  tag.src = TAG_URL;
  document.head.append(tag);
}

export function stopAnalytics(): void {
  if (!isAnalyticsHost(window.location.hostname)) {
    return;
  }
  if (window.dataLayer !== undefined) {
    // Consent alone would leave the loaded tag sending cookieless hits for the rest of this page.
    Reflect.set(window, DISABLE_FLAG, true);
    gtag("consent", "update", { analytics_storage: "denied" });
  }
  for (const cookie of makeExpiredGaCookies(document.cookie)) {
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in Safari before 18.4 or Firefox before 140.
    document.cookie = cookie;
  }
}

export function recordConsent(choice: ConsentChoice): void {
  // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in Safari before 18.4 or Firefox before 140.
  document.cookie = makeConsentCookie(choice, window.location);
  if (choice === "granted") {
    startAnalytics();
  } else {
    stopAnalytics();
  }
  if (isAnalyticsHost(window.location.hostname)) {
    // sendConsent never rejects, so there is nothing to await or catch.
    void sendConsent(choice);
  }
}
