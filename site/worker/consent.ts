import { isConsentChoice, makeConsentCookie } from "./consent-cookie.ts";

async function readChoice(request: Request): Promise<unknown> {
  try {
    const body: unknown = await request.json();

    return typeof body === "object" && body !== null
      ? Reflect.get(body, "choice")
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Safari caps cookies written by a script at 7 days but keeps one set by a response, so the
 * page asks the Worker to set the visitor's answer. The Origin check stops another site from
 * submitting a form here to grant analytics for its visitors.
 */
export async function handleConsentRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const url = new URL(request.url);
  if (request.headers.get("Origin") !== url.origin) {
    return new Response(null, { status: 403 });
  }

  const choice = await readChoice(request);
  if (!isConsentChoice(choice)) {
    return new Response(null, { status: 400 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": makeConsentCookie(choice, url),
      "Cache-Control": "no-store",
    },
  });
}
