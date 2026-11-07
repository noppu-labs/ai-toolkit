import { handleConsentRequest } from "./consent.ts";
import { makeConsentModeResponse } from "./consent-mode.ts";
import { type EdgeCache, handleBadgeRequest } from "./npm-downloads.ts";

export type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

// Not exported: workerd rejects any named export of the entry module that is
// not a handler.
const BADGE_PATH: string = "/api/badges/npm-downloads";
const CONSENT_MODE_PATH: string = "/api/consent-mode";
const CONSENT_PATH: string = "/api/consent";

// The Workers runtime provides caches.default; Node's types do not declare it.
function getEdgeCache(): EdgeCache {
  return (globalThis as unknown as { caches: { default: EdgeCache } }).caches
    .default;
}

// Cloudflare adds `cf` to incoming requests; Node's Request type does not declare it.
function getCountry(request: Request): unknown {
  const cf: unknown = Reflect.get(request, "cf");

  return typeof cf === "object" && cf !== null
    ? Reflect.get(cf, "country")
    : undefined;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === CONSENT_MODE_PATH) {
      return makeConsentModeResponse(getCountry(request));
    }
    if (pathname === CONSENT_PATH) {
      return handleConsentRequest(request);
    }
    if (pathname === BADGE_PATH) {
      return handleBadgeRequest(request, {
        // A detached fetch throws "Illegal invocation" in Workers, so wrap it.
        fetch: (...args: Parameters<typeof fetch>): Promise<Response> =>
          fetch(...args),
        cache: getEdgeCache(),
        now: new Date(),
      });
    }

    return env.ASSETS.fetch(request);
  },
};
