import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  getConsentChoice,
  isAnalyticsHost,
  isConsentChoice,
  makeConsentCookie,
} from "./consent-cookie.ts";

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
    ["noppu_analytics_consent=acknowledged", "acknowledged"],
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

describe("isConsentChoice", () => {
  it.each([
    ["granted", true],
    ["denied", true],
    ["acknowledged", true],
    ["GRANTED", false],
    ["", false],
    [null, false],
    [["granted"], false],
  ])("for %j is %s", (value, expected) => {
    expect(isConsentChoice(value)).toBe(expected);
  });
});
