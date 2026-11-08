import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchConsentMode,
  makeExpiredGaCookies,
  needsAnswer,
  parseConsentMode,
  sendConsent,
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
    ["granted", "opt-in", true],
    ["granted", "opt-out", true],
    ["granted", null, true],
    ["denied", "opt-in", false],
    ["denied", "opt-out", false],
    ["denied", null, false],
    ["acknowledged", "opt-in", false],
    ["acknowledged", "opt-out", true],
    ["acknowledged", null, null],
    [null, "opt-in", false],
    [null, "opt-out", true],
    [null, null, null],
  ] as const)("for %s in %s is %s", (choice, mode, expected) => {
    expect(shouldMeasure(choice, mode)).toBe(expected);
  });
});

describe("needsAnswer", () => {
  it.each([
    ["granted", "opt-in", false],
    ["granted", "opt-out", false],
    ["granted", null, false],
    ["denied", "opt-in", false],
    ["denied", "opt-out", false],
    ["denied", null, false],
    ["acknowledged", "opt-in", true],
    ["acknowledged", "opt-out", false],
    ["acknowledged", null, false],
    [null, "opt-in", true],
    [null, "opt-out", true],
    [null, null, true],
  ] as const)("for %s in %s is %s", (choice, mode, expected) => {
    expect(needsAnswer(choice, mode)).toBe(expected);
  });
});

describe("sendConsent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the choice to the Worker as JSON, surviving the page unloading", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);

    await sendConsent("denied");

    expect(fetch).toHaveBeenCalledWith(
      "/api/consent",
      expect.objectContaining({
        method: "POST",
        body: '{"choice":"denied"}',
        keepalive: true,
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts the earlier request when a newer answer is sent", () => {
    const signals: AbortSignal[] = [];
    const fetch = vi.fn(
      (_url: string, init: RequestInit): Promise<Response> => {
        if (init.signal) {
          signals.push(init.signal);
        }

        return new Promise(() => undefined);
      },
    );
    vi.stubGlobal("fetch", fetch);

    void sendConsent("granted");
    void sendConsent("denied");

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it.each([
    [
      "a 404",
      (): Promise<Response> =>
        Promise.resolve(new Response(null, { status: 404 })),
    ],
    [
      "a 500",
      (): Promise<Response> =>
        Promise.resolve(new Response(null, { status: 500 })),
    ],
    [
      "a rejected fetch",
      (): Promise<Response> => Promise.reject(new TypeError("offline")),
    ],
  ])("resolves quietly after %s", async (_name, respond) => {
    vi.stubGlobal("fetch", vi.fn(respond));

    expect(await sendConsent("granted")).toBeUndefined();
  });
});
