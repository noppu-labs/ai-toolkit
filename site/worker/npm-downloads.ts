// Every npm name this repo publishes, scoped and unscoped. A test keeps the
// list in step with the package.json files and release.yml's UNSCOPED_NAMES.
export const NPM_PACKAGES: readonly string[] = [
  "@noppu-labs/opencode-review",
  "@noppu-labs/opencode-investigate",
  "@noppu-labs/opencode-toolkit-core",
  "opencode-investigate",
  "opencode-toolkit-core",
];

// Before the first publish, so the windows cover every download.
export const START_DATE: string = "2026-10-01";

const DAY_MS: number = 86_400_000;

// npm's point API silently clamps a range longer than 18 months.
const WINDOW_DAYS: number = 365;

const FRESH_SECONDS: number = 21_600;

const LAST_GOOD_SECONDS: number = 2_592_000;

const UNAVAILABLE_SECONDS: number = 300;

export type EdgeCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, response: Response): Promise<void>;
};

export type BadgeDeps = {
  fetch: typeof fetch;
  cache: EdgeCache;
  now: Date;
};

type Badge = {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
  cacheSeconds: number;
};

function formatDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function makeDateWindows(
  start: string,
  end: string,
): [string, string][] {
  const last: number = Date.parse(end);
  const windows: [string, string][] = [];

  for (let from: number = Date.parse(start); from <= last; ) {
    const to: number = Math.min(from + (WINDOW_DAYS - 1) * DAY_MS, last);

    windows.push([formatDay(from), formatDay(to)]);
    from = to + DAY_MS;
  }

  return windows;
}

export function formatCount(count: number): string {
  const thousands: number = Math.round(count / 100) / 10;

  if (count < 1000) {
    return String(count);
  }

  if (thousands < 1000) {
    return `${thousands}k`;
  }

  return `${Math.round(count / 100_000) / 10}M`;
}

async function fetchDownloads(
  fetcher: typeof fetch,
  name: string,
  [from, to]: [string, string],
): Promise<number> {
  const response: Response = await fetcher(
    `https://api.npmjs.org/downloads/point/${from}:${to}/${name}`,
  );

  // npm answers 404 for a package with no downloads in the range.
  if (response.status === 404) {
    return 0;
  }

  if (!response.ok) {
    throw new Error(
      `npm downloads API returned ${response.status} for ${name}`,
    );
  }

  const body: { downloads?: number } = (await response.json()) as {
    downloads?: number;
  };

  return body.downloads ?? 0;
}

export async function sumDownloads(
  fetcher: typeof fetch,
  packages: readonly string[],
  windows: [string, string][],
): Promise<number> {
  const counts: number[] = await Promise.all(
    packages.flatMap((name: string): Promise<number>[] =>
      windows.map(
        (window: [string, string]): Promise<number> =>
          fetchDownloads(fetcher, name, window),
      ),
    ),
  );

  return counts.reduce(
    (total: number, count: number): number => total + count,
    0,
  );
}

function makeBadgeResponse(badge: Badge, maxAge: number): Response {
  return Response.json(badge, {
    headers: { "cache-control": `public, max-age=${maxAge}` },
  });
}

function makeBadge(
  message: string,
  color: string,
  cacheSeconds: number,
): Badge {
  return {
    schemaVersion: 1,
    label: "npm downloads",
    message,
    color,
    cacheSeconds,
  };
}

export async function handleBadgeRequest(
  request: Request,
  deps: BadgeDeps,
): Promise<Response> {
  const url: URL = new URL(request.url);
  const freshKey: Request = new Request(`${url.origin}${url.pathname}`);
  const lastGoodKey: Request = new Request(`${freshKey.url}?last-good`);
  const cached: Response | undefined = await deps.cache.match(freshKey);

  if (cached !== undefined) {
    return cached;
  }

  try {
    const total: number = await sumDownloads(
      deps.fetch,
      NPM_PACKAGES,
      makeDateWindows(START_DATE, formatDay(deps.now.getTime())),
    );
    const badge: Badge = makeBadge(formatCount(total), "blue", FRESH_SECONDS);

    await deps.cache.put(freshKey, makeBadgeResponse(badge, FRESH_SECONDS));
    await deps.cache.put(
      lastGoodKey,
      makeBadgeResponse(badge, LAST_GOOD_SECONDS),
    );

    return makeBadgeResponse(badge, FRESH_SECONDS);
  } catch (error) {
    // Workers Logs keeps this, so a fallback badge can be traced to its cause.
    console.error("npm downloads badge: npm request failed", error);

    const lastGood: Response | undefined = await deps.cache.match(lastGoodKey);

    return (
      lastGood ??
      makeBadgeResponse(
        makeBadge("unavailable", "lightgrey", UNAVAILABLE_SECONDS),
        UNAVAILABLE_SECONDS,
      )
    );
  }
}
