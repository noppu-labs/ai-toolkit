export type ConsentMode = "opt-in" | "opt-out";

export const CONSENT_MODE_PATH = "/api/consent-mode";

/**
 * Where analytics waits for consent: the EEA, the UK and Switzerland. EU regions that ISO
 * codes separately (Åland, the French outermost regions) are listed too, as are Gibraltar and
 * the Crown dependencies, whose data protection laws follow the UK's.
 */
export const ASK_FIRST_COUNTRIES: readonly string[] = [
  // EU
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "ES",
  "FI",
  "FR",
  "GR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
  // Parts of EU countries with their own codes
  "AX",
  "GF",
  "GP",
  "MF",
  "MQ",
  "RE",
  "YT",
  // Rest of the EEA
  "IS",
  "LI",
  "NO",
  // UK, Gibraltar and the Crown dependencies
  "GB",
  "GG",
  "GI",
  "IM",
  "JE",
  "CH",
];

/** Cloudflare's codes for an unknown country and for Tor. */
const UNKNOWN_COUNTRIES: readonly string[] = ["XX", "T1"];

/** Asks first whenever the country is missing or unknown: a wrong guess must not count anyone. */
export function getConsentMode(country: unknown): ConsentMode {
  if (
    typeof country !== "string" ||
    !/^[A-Z]{2}$/.test(country) ||
    UNKNOWN_COUNTRIES.includes(country) ||
    ASK_FIRST_COUNTRIES.includes(country)
  ) {
    return "opt-in";
  }

  return "opt-out";
}

/** Private, so no shared cache hands one visitor's answer to another; an hour covers a visit. */
export function makeConsentModeResponse(country: unknown): Response {
  return Response.json(
    { mode: getConsentMode(country) },
    {
      headers: {
        "Cache-Control": "private, max-age=3600",
      },
    },
  );
}
