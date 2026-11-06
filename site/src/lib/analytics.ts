import { SITE_URL } from "./site.ts";

export type ConsentChoice = "granted" | "denied";

type PageLocation = Pick<Location, "hostname" | "protocol">;

declare global {
  interface Window {
    dataLayer?: IArguments[];
  }
}

/** Public by design: Google's tag URL carries it in every visitor's browser. */
const MEASUREMENT_ID = "G-MHP3L2JTTP";
const TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
const DISABLE_FLAG = `ga-disable-${MEASUREMENT_ID}`;

export const CONSENT_COOKIE = "noppu_analytics_consent";
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
/** noppu.com and its subdomains share one Google Analytics stream, so they share the visitor's choice too. */
const SHARED_COOKIE_DOMAIN = ".noppu.com";

const ANALYTICS_HOST: string = new URL(SITE_URL).hostname;

/** Previews and local builds serve the same HTML; only production may count anyone. */
export function isAnalyticsHost(hostname: string): boolean {
  return hostname === ANALYTICS_HOST;
}

function getCookieNames(cookies: string): string[] {
  return cookies
    .split("; ")
    .map((cookie) => cookie.split("=", 1)[0] ?? "")
    .filter((name) => name !== "");
}

export function getConsentChoice(cookies: string): ConsentChoice | null {
  const value = cookies
    .split("; ")
    .find((cookie) => cookie.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);

  return value === "granted" || value === "denied" ? value : null;
}

export function makeConsentCookie(
  choice: ConsentChoice,
  { hostname, protocol }: PageLocation,
): string {
  const attributes = [
    `${CONSENT_COOKIE}=${choice}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    // biome-ignore lint/security/noSecrets: a cookie attribute.
    "SameSite=Lax",
  ];
  if (isAnalyticsHost(hostname)) {
    attributes.push(`Domain=${SHARED_COOKIE_DOMAIN}`);
  }
  if (protocol === "https:") {
    attributes.push("Secure");
  }

  return attributes.join("; ");
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

/**
 * Basic consent mode: the tag loads only after the visitor allows it, so a visitor who
 * declines sends Google nothing. The ad settings stay denied: the site runs no ads.
 */
export function startAnalytics(): void {
  if (!isAnalyticsHost(window.location.hostname)) {
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

function stopAnalytics(): void {
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
}
