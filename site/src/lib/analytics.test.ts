import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getConsentChoice,
  isAnalyticsHost,
  makeConsentCookie,
  makeExpiredGaCookies,
} from "./analytics.ts";

const PRODUCTION = { hostname: "toolkit.noppu.com", protocol: "https:" };

describe("isAnalyticsHost", () => {
  it.each([
    ["toolkit.noppu.com", true],
    ["feat-x-preview.toolkit.noppu.dev", false],
    ["toolkit.noppu.com.evil.example", false],
    ["localhost", false],
  ])("for %s is %s", (hostname, expected) => {
    expect(isAnalyticsHost(hostname)).toBe(expected);
  });
});

describe("getConsentChoice", () => {
  it.each([
    ["", null],
    ["noppu_analytics_consent=granted", "granted"],
    ["a=1; noppu_analytics_consent=denied; b=2", "denied"],
    ["noppu_analytics_consent=maybe", null],
    ["not_noppu_analytics_consent=granted", null],
  ])("reads %j as %s", (cookies, expected) => {
    expect(getConsentChoice(cookies)).toBe(expected);
  });

  it("never reports consent the cookie header does not grant", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.stringMatching(/^[a-z_]+$/), fc.string())),
        (pairs) => {
          const cookies = pairs
            .filter(([name]) => name !== "noppu_analytics_consent")
            .map(([name, value]) => `${name}=${value.replaceAll(";", "")}`)
            .join("; ");

          expect(getConsentChoice(cookies)).toBeNull();
        },
      ),
    );
  });
});

describe("makeConsentCookie", () => {
  it("shares the choice across noppu.com over HTTPS on production", () => {
    expect(makeConsentCookie("granted", PRODUCTION)).toBe(
      "noppu_analytics_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax; Domain=.noppu.com; Secure",
    );
  });

  it("stays on the current host anywhere else", () => {
    expect(
      makeConsentCookie("denied", {
        hostname: "localhost",
        protocol: "http:",
      }),
    ).toBe(
      "noppu_analytics_consent=denied; Path=/; Max-Age=15552000; SameSite=Lax",
    );
  });

  it("round-trips through getConsentChoice", () => {
    const [pair] = makeConsentCookie("denied", PRODUCTION).split(";");

    expect(getConsentChoice(pair ?? "")).toBe("denied");
  });
});

describe("makeExpiredGaCookies", () => {
  it("expires only the Google Analytics cookies, on the domain they were set on", () => {
    expect(
      makeExpiredGaCookies(
        "theme=dark; _ga=GA1.1.1; _ga_MHP3L2JTTP=GS1; noppu_analytics_consent=granted; _gallery=1",
      ),
    ).toEqual([
      "_ga=; Path=/; Max-Age=0; Domain=.noppu.com",
      "_ga_MHP3L2JTTP=; Path=/; Max-Age=0; Domain=.noppu.com",
    ]);
  });

  it("has nothing to expire when no such cookie exists", () => {
    expect(makeExpiredGaCookies("theme=dark")).toEqual([]);
  });
});
