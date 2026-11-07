import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { handleConsentRequest } from "./consent.ts";

function makeRequest(url: string, init: RequestInit): Request {
  return new Request(url, init);
}

const PRODUCTION_URL = "https://toolkit.noppu.com/api/consent";

describe("handleConsentRequest", () => {
  it("sets the shared cookie for a granted answer on production", async () => {
    const response = await handleConsentRequest(
      makeRequest(PRODUCTION_URL, {
        method: "POST",
        headers: { Origin: "https://toolkit.noppu.com" },
        body: JSON.stringify({ choice: "granted" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(
      "noppu_analytics_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax; Domain=.noppu.com; Secure",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets a host-only cookie on a preview", async () => {
    const origin = "https://feat-x-preview.toolkit.noppu.dev";
    const response = await handleConsentRequest(
      makeRequest(`${origin}/api/consent`, {
        method: "POST",
        headers: { Origin: origin },
        body: JSON.stringify({ choice: "denied" }),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toBe(
      "noppu_analytics_consent=denied; Path=/; Max-Age=15552000; SameSite=Lax; Secure",
    );
  });

  it.each([
    ["a request without an Origin", {}],
    ["a foreign Origin", { Origin: "https://evil.example" }],
    [
      "an Origin that only starts like ours",
      { Origin: "https://toolkit.noppu.com.evil.example" },
    ],
    ["an Origin with another scheme", { Origin: "http://toolkit.noppu.com" }],
  ])("refuses %s with 403 and sets nothing", async (_name, headers) => {
    const response = await handleConsentRequest(
      makeRequest(PRODUCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ choice: "granted" }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["GET", "PUT"])("refuses %s with 405", async (method) => {
    const response = await handleConsentRequest(
      makeRequest(PRODUCTION_URL, {
        method,
        headers: { Origin: "https://toolkit.noppu.com" },
        ...(method === "PUT" ? { body: "{}" } : {}),
      }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([
    '{"choice":"maybe"}',
    '{"choice":"GRANTED"}',
    '{"choice":["granted"]}',
    '["granted"]',
    "",
    "not json",
  ])("refuses the body %s with 400 and sets nothing", async (body) => {
    const response = await handleConsentRequest(
      makeRequest(PRODUCTION_URL, {
        method: "POST",
        headers: { Origin: "https://toolkit.noppu.com" },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects anything but a valid choice with 400", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string(),
          fc.jsonValue().map((value) => JSON.stringify(value)),
          fc.jsonValue().map((choice) => JSON.stringify({ choice })),
        ),
        async (body) => {
          try {
            const choice: unknown = Reflect.get(
              Object(JSON.parse(body)),
              "choice",
            );
            fc.pre(choice !== "granted" && choice !== "denied");
          } catch (error) {
            if (!(error instanceof SyntaxError)) {
              throw error;
            }
          }

          const response = await handleConsentRequest(
            makeRequest(PRODUCTION_URL, {
              method: "POST",
              headers: { Origin: "https://toolkit.noppu.com" },
              body,
            }),
          );

          expect(response.status).toBe(400);
          expect(response.headers.get("set-cookie")).toBeNull();
        },
      ),
    );
  });
});
