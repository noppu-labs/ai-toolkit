import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchConsentMode,
  makeExpiredGaCookies,
  parseConsentMode,
  shouldMeasure,
} from "./analytics.ts";

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

describe("parseConsentMode", () => {
  it.each([
    [{ mode: "opt-out" }, "opt-out"],
    [{ mode: "opt-in" }, "opt-in"],
    [{ mode: "OPT-OUT" }, "opt-in"],
    [{}, "opt-in"],
    [null, "opt-in"],
    ["opt-out", "opt-in"],
  ])("reads %j as %s", (body, expected) => {
    expect(parseConsentMode(body)).toBe(expected);
  });

  it("only opts out on an exact opt-out answer", () => {
    fc.assert(
      fc.property(fc.anything(), (body) => {
        fc.pre(
          !(
            typeof body === "object" &&
            body !== null &&
            Reflect.get(body, "mode") === "opt-out"
          ),
        );

        expect(parseConsentMode(body)).toBe("opt-in");
      }),
    );
  });
});

describe("fetchConsentMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "globalPrivacyControl");
  });

  it("asks the Worker", async () => {
    const fetch = vi.fn(async () => Response.json({ mode: "opt-out" }));
    vi.stubGlobal("fetch", fetch);

    expect(await fetchConsentMode()).toBe("opt-out");
    expect(fetch).toHaveBeenCalledWith(
      "/api/consent-mode",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each([
    [
      "an error status",
      async (): Promise<Response> => new Response("", { status: 404 }),
    ],
    [
      "a body that is not JSON",
      async (): Promise<Response> => new Response("<html>"),
    ],
    [
      "a network failure",
      async (): Promise<Response> => Promise.reject(new TypeError("offline")),
    ],
  ])("asks first after %s", async (_, fetch) => {
    vi.stubGlobal("fetch", fetch);

    expect(await fetchConsentMode()).toBe("opt-in");
  });

  it("asks first without asking the Worker when the browser sends a privacy signal", async () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      configurable: true,
      value: true,
    });
    const fetch = vi.fn(async () => Response.json({ mode: "opt-out" }));
    vi.stubGlobal("fetch", fetch);

    expect(await fetchConsentMode()).toBe("opt-in");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("shouldMeasure", () => {
  it.each([
    ["granted", null, true],
    ["granted", "opt-in", true],
    ["denied", "opt-out", false],
    [null, "opt-out", true],
    [null, "opt-in", false],
    [null, null, null],
  ] as const)("for %s in %s is %s", (choice, mode, expected) => {
    expect(shouldMeasure(choice, mode)).toBe(expected);
  });
});
