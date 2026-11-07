import { SITE_URL } from "../src/lib/site.ts";

export type ConsentChoice = "granted" | "denied";

export const CONSENT_COOKIE = "noppu_analytics_consent";
const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
/** noppu.com and its subdomains share one Google Analytics stream, so they share the visitor's choice too. */
export const SHARED_COOKIE_DOMAIN = ".noppu.com";

const ANALYTICS_HOST: string = new URL(SITE_URL).hostname;

/** Previews and local builds serve the same HTML; only production may count anyone. */
export function isAnalyticsHost(hostname: string): boolean {
  return hostname === ANALYTICS_HOST;
}

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === "granted" || value === "denied";
}

export function getConsentChoice(cookies: string): ConsentChoice | null {
  const value = cookies
    .split("; ")
    .find((cookie) => cookie.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);

  return isConsentChoice(value) ? value : null;
}

export function makeConsentCookie(
  choice: ConsentChoice,
  { hostname, protocol }: { hostname: string; protocol: string },
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
