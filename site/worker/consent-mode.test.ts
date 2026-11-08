import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ASK_FIRST_COUNTRIES,
  getConsentMode,
  makeConsentModeResponse,
} from "./consent-mode.ts";

describe("ASK_FIRST_COUNTRIES", () => {
  it.each([
    ["DE", "an EU country"],
    ["NO", "an EEA country outside the EU"],
    ["GB", "the UK"],
    ["CH", "Switzerland"],
    ["RE", "an EU outermost region Cloudflare reports on its own"],
    ["SJ", "Svalbard and Jan Mayen, which follow Norway"],
  ])("includes %s, %s", (country, _description) => {
    expect(ASK_FIRST_COUNTRIES).toContain(country);
  });

  it("holds unique two-letter codes", () => {
    expect(new Set(ASK_FIRST_COUNTRIES).size).toBe(ASK_FIRST_COUNTRIES.length);
    for (const country of ASK_FIRST_COUNTRIES) {
      expect(country).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("getConsentMode", () => {
  it.each([
    ["US", "opt-out"],
    ["BR", "opt-out"],
    ["FR", "opt-in"],
    ["GB", "opt-in"],
    ["SJ", "opt-in"],
  ])("for %s is %s", (country, expected) => {
    expect(getConsentMode(country)).toBe(expected);
  });

  it.each([
    [undefined, "no country"],
    [null, "a null country"],
    ["", "an empty country"],
    ["XX", "Cloudflare's unknown country"],
    ["T1", "Tor"],
    ["us", "a lowercase code"],
  ])("asks first for %j, %s", (country, _description) => {
    expect(getConsentMode(country)).toBe("opt-in");
  });

  it("asks first unless the country is a known code outside the list", () => {
    fc.assert(
      fc.property(fc.anything(), (country) => {
        const mode = getConsentMode(country);
        const isKnownElsewhere =
          typeof country === "string" &&
          /^[A-Z]{2}$/.test(country) &&
          !["XX", "T1"].includes(country) &&
          !ASK_FIRST_COUNTRIES.includes(country);

        expect(mode).toBe(isKnownElsewhere ? "opt-out" : "opt-in");
      }),
    );
  });
});

describe("makeConsentModeResponse", () => {
  it("answers with the mode as JSON, cached only in the visitor's browser", async () => {
    const response = makeConsentModeResponse("US");

    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(await response.json()).toEqual({ mode: "opt-out" });
  });
});
