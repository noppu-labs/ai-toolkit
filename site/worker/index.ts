import { type EdgeCache, handleBadgeRequest } from "./npm-downloads.ts";

export type Env = {
  ASSETS: { fetch(request: Request): Promise<Response> };
};

// Not exported: workerd rejects any named export of the entry module that is
// not a handler.
const BADGE_PATH: string = "/api/badges/npm-downloads";

// The Workers runtime provides caches.default; Node's types do not declare it.
function getEdgeCache(): EdgeCache {
  return (globalThis as unknown as { caches: { default: EdgeCache } }).caches
    .default;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === BADGE_PATH) {
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
