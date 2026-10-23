import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index.ts";
import {
  type EdgeCache,
  formatCount,
  handleBadgeRequest,
  makeDateWindows,
  NPM_PACKAGES,
  START_DATE,
  sumDownloads,
} from "./npm-downloads.ts";

type Badge = {
  schemaVersion: number;
  label: string;
  message: string;
  color: string;
  cacheSeconds: number;
};

const ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const BADGE_URL: string = "https://toolkit.noppu.com/api/badges/npm-downloads";

function readPackageName(path: string): string {
  const manifest: { name: string } = JSON.parse(readFileSync(path, "utf8"));

  return manifest.name;
}

function listRepoPackages(): string[] {
  const plugins: string[] = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry): boolean => entry.isDirectory())
    .map((entry): string => join(ROOT, entry.name, "package.json"))
    .filter((path: string): boolean => {
      try {
        readFileSync(path);

        return true;
      } catch {
        return false;
      }
    })
    .filter((path: string): boolean => !path.endsWith("/site/package.json"))
    .map(readPackageName)
    .filter((name: string): boolean => name.startsWith("@noppu-labs/"));
  const shared: string[] = readdirSync(join(ROOT, "packages")).map(
    (dir: string): string =>
      readPackageName(join(ROOT, "packages", dir, "package.json")),
  );
  const workflow: string = readFileSync(
    join(ROOT, ".github", "workflows", "release.yml"),
    "utf8",
  );
  const unscoped: string[] = (
    /UNSCOPED_NAMES: "([^"]*)"/.exec(workflow)?.[1] ?? ""
  )
    .split(" ")
    .filter((name: string): boolean => name !== "");

  return [...plugins, ...shared, ...unscoped].sort();
}

function makeMemoryCache(): EdgeCache & { store: Map<string, Response> } {
  const store: Map<string, Response> = new Map();

  return {
    store,
    match: async (key: Request): Promise<Response | undefined> =>
      store.get(key.url)?.clone(),
    put: async (key: Request, response: Response): Promise<void> => {
      store.set(key.url, response.clone());
    },
  };
}

function makeNpmFetch(counts: Record<string, number>): {
  fetch: typeof fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fake = async (
    input: Parameters<typeof fetch>[0],
  ): Promise<Response> => {
    const url: string = String(input);

    calls.push(url);

    const name: string = decodeURIComponent(
      url.replace(/^.*\/downloads\/point\/[^/]+\//, ""),
    );

    return Response.json({ downloads: counts[name] ?? 0, package: name });
  };

  return { fetch: fake as typeof fetch, calls };
}

async function readBadge(response: Response): Promise<Badge> {
  return (await response.json()) as Badge;
}

describe("NPM_PACKAGES", () => {
  it("lists every npm name the repo publishes, scoped and unscoped", () => {
    expect([...NPM_PACKAGES].sort()).toEqual(listRepoPackages());
  });
});

describe("makeDateWindows", () => {
  it("covers one short range in a single window", () => {
    expect(makeDateWindows("2026-10-01", "2026-10-23")).toEqual([
      ["2026-10-01", "2026-10-23"],
    ]);
  });

  it("splits a long range into contiguous windows of at most 365 days", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4000 }), (days: number): void => {
        const end: string = new Date(Date.UTC(2026, 9, 1) + days * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const windows: [string, string][] = makeDateWindows("2026-10-01", end);

        expect(windows[0]?.[0]).toBe("2026-10-01");
        expect(windows.at(-1)?.[1]).toBe(end);

        for (const [index, [from, to]] of windows.entries()) {
          const span: number =
            (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;

          expect(span).toBeGreaterThanOrEqual(1);
          expect(span).toBeLessThanOrEqual(365);

          const next: [string, string] | undefined = windows[index + 1];

          if (next !== undefined) {
            expect(Date.parse(next[0]) - Date.parse(to)).toBe(86_400_000);
          }
        }
      }),
    );
  });
});

describe("formatCount", () => {
  it("formats counts the way shields.io badges usually read", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(56_789)).toBe("56.8k");
    expect(formatCount(999_949)).toBe("999.9k");
    expect(formatCount(1_250_000)).toBe("1.3M");
  });
});

describe("sumDownloads", () => {
  it("adds every package across every window", async () => {
    const { fetch, calls } = makeNpmFetch({
      "@noppu-labs/opencode-review": 300,
      "opencode-investigate": 20,
    });
    const total: number = await sumDownloads(
      fetch,
      ["@noppu-labs/opencode-review", "opencode-investigate"],
      [
        ["2025-01-01", "2025-12-31"],
        ["2026-01-01", "2026-10-23"],
      ],
    );

    expect(total).toBe(640);
    expect(calls).toHaveLength(4);
    expect(calls).toContain(
      "https://api.npmjs.org/downloads/point/2026-01-01:2026-10-23/@noppu-labs/opencode-review",
    );
  });

  it("counts a package npm has no data for as zero", async () => {
    const fake = async (): Promise<Response> =>
      Response.json({ error: "package x not found" }, { status: 404 });

    expect(
      await sumDownloads(
        fake as typeof fetch,
        ["x"],
        [["2026-10-01", "2026-10-02"]],
      ),
    ).toBe(0);
  });

  it("counts a reply without a downloads field as zero", async () => {
    const fake = async (): Promise<Response> => Response.json({});

    expect(
      await sumDownloads(
        fake as typeof fetch,
        ["x"],
        [["2026-10-01", "2026-10-02"]],
      ),
    ).toBe(0);
  });

  it("rejects when npm fails", async () => {
    const fake = async (): Promise<Response> =>
      new Response("busy", { status: 503 });

    await expect(
      sumDownloads(fake as typeof fetch, ["x"], [["2026-10-01", "2026-10-02"]]),
    ).rejects.toThrow(/503/);
  });
});

describe("handleBadgeRequest", () => {
  const now: Date = new Date("2026-10-23T12:00:00Z");

  it("returns a shields.io endpoint badge with the all-time total", async () => {
    const counts: Record<string, number> = Object.fromEntries(
      NPM_PACKAGES.map((name: string): [string, number] => [name, 250]),
    );
    const { fetch, calls } = makeNpmFetch(counts);
    const response: Response = await handleBadgeRequest(
      new Request(BADGE_URL),
      {
        fetch,
        cache: makeMemoryCache(),
        now,
      },
    );
    const badge: Badge = await readBadge(response);

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(badge).toEqual({
      schemaVersion: 1,
      label: "npm downloads",
      message: formatCount(250 * NPM_PACKAGES.length),
      color: "blue",
      cacheSeconds: 21_600,
    });
    expect(
      calls.every((url: string): boolean =>
        url.includes(`${START_DATE}:2026-10-23`),
      ),
    ).toBe(true);
  });

  it("serves a cached badge without calling npm", async () => {
    const cache = makeMemoryCache();
    const first = makeNpmFetch({ "@noppu-labs/opencode-review": 5 });

    await handleBadgeRequest(new Request(BADGE_URL), {
      fetch: first.fetch,
      cache,
      now,
    });

    const second = makeNpmFetch({});
    const badge: Badge = await readBadge(
      await handleBadgeRequest(new Request(BADGE_URL), {
        fetch: second.fetch,
        cache,
        now,
      }),
    );

    expect(second.calls).toHaveLength(0);
    expect(badge.message).toBe("5");
  });

  it("falls back to the last good badge when npm fails", async () => {
    const cache = makeMemoryCache();
    const good = makeNpmFetch({ "@noppu-labs/opencode-review": 7 });

    await handleBadgeRequest(new Request(BADGE_URL), {
      fetch: good.fetch,
      cache,
      now,
    });
    cache.store.delete(BADGE_URL);

    const failing = async (): Promise<Response> =>
      new Response("down", { status: 500 });
    const badge: Badge = await readBadge(
      await handleBadgeRequest(new Request(BADGE_URL), {
        fetch: failing as typeof fetch,
        cache,
        now,
      }),
    );

    expect(badge.message).toBe("7");
  });

  it("shows an unavailable badge when npm fails and nothing is cached", async () => {
    const failing = async (): Promise<Response> =>
      new Response("down", { status: 500 });
    const response: Response = await handleBadgeRequest(
      new Request(BADGE_URL),
      {
        fetch: failing as typeof fetch,
        cache: makeMemoryCache(),
        now,
      },
    );
    const badge: Badge = await readBadge(response);

    expect(response.status).toBe(200);
    expect(badge).toMatchObject({
      message: "unavailable",
      color: "lightgrey",
      cacheSeconds: 300,
    });
  });
});

describe("worker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers the badge path from the edge cache and npm", async () => {
    const cache = makeMemoryCache();
    const npm = makeNpmFetch({ "opencode-investigate": 42 });

    vi.stubGlobal("caches", { default: cache });
    vi.stubGlobal("fetch", npm.fetch);

    const env = {
      ASSETS: {
        fetch: async (): Promise<Response> => new Response("asset"),
      },
    };
    const badge: Badge = await readBadge(
      await worker.fetch(new Request(BADGE_URL), env),
    );

    expect(badge.message).toBe("42");
    expect(npm.calls).toHaveLength(NPM_PACKAGES.length);
    expect(cache.store.has(BADGE_URL)).toBe(true);
  });

  it("passes every other path to the static assets", async () => {
    const seen: string[] = [];
    const env = {
      ASSETS: {
        fetch: async (request: Request): Promise<Response> => {
          seen.push(new URL(request.url).pathname);

          return new Response("asset");
        },
      },
    };
    const response: Response = await worker.fetch(
      new Request("https://toolkit.noppu.com/missing"),
      env,
    );

    expect(await response.text()).toBe("asset");
    expect(seen).toEqual(["/missing"]);
  });
});
