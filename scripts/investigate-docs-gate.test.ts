import { mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Cand = {
  id: string;
  title?: string;
  branch?: string;
  versions: unknown[];
  updated: string;
  bench?: number;
};
type Verdict = { rank: number; label: string };
type DepRow = {
  name: string;
  version: string;
  dev: boolean;
  ecosystem: "composer" | "npm";
};
type Gate = {
  perPackage: Array<{
    row: DepRow;
    verdicts: Array<{ id: string; mark: string; label: string }>;
    error?: string;
    noMatch?: boolean;
    noUsable?: boolean;
  }>;
  fetchable: Array<{ id: string; name: string; version: string }>;
  anonymous: boolean;
};
type CacheModule = {
  TtlCache: new (
    dir: string,
    ttlMs: number,
  ) => { get: (k: string) => unknown; put: (k: string, d: unknown) => void };
  defaultCacheDir: (env?: NodeJS.ProcessEnv) => string;
};
type GateModule = {
  majorOf: (v: unknown) => number | null;
  c7Relevant: (cand: Cand, pkgName: string, ecosystem: string) => boolean;
  c7Query: (pkgName: string, ecosystem: string) => string;
  idVersionMajor: (id: string) => number | null;
  bestPin: (
    versions: unknown[],
    installedMajor: number | null,
  ) => string | undefined;
  c7Verdict: (
    cand: Cand,
    installedMajor: number | null,
    pkgName: string,
  ) => Verdict;
  c7Search: (
    pkgName: string,
    ecosystem: string,
    deps: {
      fetchImpl: typeof fetch;
      cache: {
        get: (k: string) => unknown;
        put: (k: string, d: unknown) => void;
      };
      apiKey?: string;
    },
  ) => Promise<{ results: Cand[] } | { error: string }>;
  docSources: (
    rows: DepRow[],
    deps: {
      fetchImpl: typeof fetch;
      cache: {
        get: (k: string) => unknown;
        put: (k: string, d: unknown) => void;
      };
      apiKey?: string;
    },
  ) => Promise<Gate>;
};

const libDir: string = join(
  import.meta.dirname,
  "..",
  "investigate",
  "skills",
  "brief",
  "scripts",
  "lib",
);
const cacheMod: CacheModule = (await import(
  pathToFileURL(join(libDir, "cache.mjs")).href
)) as CacheModule;
const gate: GateModule = (await import(
  pathToFileURL(join(libDir, "docs-gate.mjs")).href
)) as GateModule;

const TODAY: string = new Date().toISOString().slice(0, 10);
const cand = (over: Partial<Cand>): Cand => ({
  id: "/x/y",
  title: "",
  branch: "main",
  versions: [],
  updated: TODAY,
  ...over,
});

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function memCache(): {
  get: (k: string) => unknown;
  put: (k: string, d: unknown) => void;
  store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>();
  return {
    store,
    get: (k: string): unknown => store.get(k) ?? null,
    put: (k: string, d: unknown): void => void store.set(k, d),
  };
}

describe("TtlCache", () => {
  it("round-trips, expires, and sanitises keys", () => {
    const dir = mkdtempSync(join(tmpdir(), "investigate-cache-"));
    const c = new cacheMod.TtlCache(dir, 60_000);
    c.put("@inertiajs/react", { a: 1 });
    expect(c.get("@inertiajs/react")).toEqual({ a: 1 });
    const old = new Date(Date.now() - 120_000);
    utimesSync(join(dir, "_inertiajs_react.json"), old, old);
    expect(c.get("@inertiajs/react")).toBeNull();
    expect(c.get("never")).toBeNull();
  });

  it("defaultCacheDir honours the env override", () => {
    expect(
      cacheMod.defaultCacheDir({ INVESTIGATE_BRIEF_CACHE_DIR: "/tmp/z" }),
    ).toBe("/tmp/z");
    expect(cacheMod.defaultCacheDir({})).toContain("investigate-brief");
  });
});

describe("majorOf", () => {
  it.each([
    ["v13.17.0", 13],
    ["3.3.1", 3],
    ["^2.0", 2],
    ["3.x", 3],
    ["main", null],
    ["", null],
    [null, null],
    [undefined, null],
  ])("majorOf(%j) = %j", (v, expected) => {
    expect(gate.majorOf(v)).toBe(expected);
  });
});

describe("idVersionMajor", () => {
  it.each([
    ["/websites/inertiajs_v2", 2],
    ["/websites/laravel_framework_8_x", 8],
    ["/websites/v3_zod_dev", 3],
    ["/websites/foo_v2_bar", 2],
    ["/laravel/framework", null],
    ["/x/react19", null],
  ])("idVersionMajor(%j) = %j", (id, expected) => {
    expect(gate.idVersionMajor(id)).toBe(expected);
  });
});

describe("bestPin", () => {
  it("returns the highest version of the installed major and ignores junk", () => {
    expect(
      gate.bestPin(["v3.1.0", "v3.10.2", "v2.9.9", "latest", "", 42], 3),
    ).toBe("v3.10.2");
    expect(gate.bestPin(["v2.0.0"], 3)).toBeUndefined();
    expect(gate.bestPin([], 3)).toBeUndefined();
  });

  it("never throws and always returns a member of the input with the right major", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.constant(null),
            fc.constant(undefined),
          ),
        ),
        fc.option(fc.integer({ min: 0, max: 50 }), { nil: null }),
        (versions, major) => {
          const r = gate.bestPin(versions, major);
          return (
            r === undefined ||
            (versions.includes(r) && gate.majorOf(r) === major)
          );
        },
      ),
    );
  });
});

describe("c7Query and c7Relevant", () => {
  it("queries the scope alone for scoped npm packages and verbatim otherwise", () => {
    expect(gate.c7Query("@inertiajs/react", "npm")).toBe("inertiajs");
    expect(gate.c7Query("lucide-react", "npm")).toBe("lucide-react");
    expect(gate.c7Query("spatie/laravel-data", "composer")).toBe(
      "spatie/laravel-data",
    );
  });

  it("matches on the distinctive token per ecosystem", () => {
    expect(
      gate.c7Relevant(
        cand({ id: "/inertiajs/inertia" }),
        "@inertiajs/react",
        "npm",
      ),
    ).toBe(true);
    expect(
      gate.c7Relevant(
        cand({ id: "/facebook/react" }),
        "@inertiajs/react",
        "npm",
      ),
    ).toBe(false);
    expect(
      gate.c7Relevant(
        cand({ id: "/briannesbitt/carbon" }),
        "nesbot/carbon",
        "composer",
      ),
    ).toBe(true);
  });
});

describe("c7Verdict", () => {
  it.each<[Partial<Cand>, number, number, RegExp]>([
    [{ id: "/websites/inertiajs_v3" }, 3, 0, /USE UNPINNED/],
    [{ id: "/websites/inertiajs_v2" }, 3, 5, /STALE/],
    [{ branch: "3.x" }, 3, 0, /USE UNPINNED/],
    [{ branch: "2.x", versions: ["v3.0.1"] }, 3, 2, /PIN to/],
    [{ branch: "2.x" }, 3, 5, /STALE/],
    [{ branch: "4.x" }, 3, 4, /AHEAD/],
    [{ branch: "main" }, 3, 1, /USE UNPINNED/],
    [
      { branch: "main", updated: "2020-01-01", versions: ["v3.0.0"] },
      3,
      2,
      /PIN to/,
    ],
    [
      { branch: "main", updated: "2020-01-01", versions: ["v2.0.0"] },
      3,
      5,
      /do NOT pin/,
    ],
    [{ branch: "main", updated: "2020-01-01" }, 3, 4, /STALE-ISH/],
    [{ branch: "weird", updated: "" }, 3, 3, /no version signal/],
    [{ branch: "weird" }, 3, 3, /no version signal/],
    [
      { id: "/llmstxt/inertia-rails_dev", title: "Inertia Rails" },
      3,
      6,
      /DIFFERENT STACK/,
    ],
  ])("%j with installed %i → rank %i", (over, major, rank, label) => {
    const v = gate.c7Verdict(cand(over), major, "@inertiajs/react");
    expect(v.rank).toBe(rank);
    expect(v.label).toMatch(label);
  });

  it("reports an unparsed installed version as rank 4", () => {
    expect(gate.c7Verdict(cand({}), null, "x").rank).toBe(4);
  });

  it("does not flag a stack word that is part of the package name", () => {
    expect(
      gate.c7Verdict(
        cand({ id: "/laravel/framework", branch: "13.x" }),
        13,
        "laravel/framework",
      ).rank,
    ).toBe(0);
  });

  it("always yields rank 0..6 and a label, for any candidate", () => {
    const candArb = fc.record({
      id: fc.string(),
      title: fc.string(),
      branch: fc.oneof(fc.string(), fc.constant(undefined)),
      versions: fc.array(
        fc.oneof(fc.string(), fc.integer(), fc.constant(null)),
      ),
      updated: fc.oneof(fc.constant(TODAY), fc.constant(""), fc.string()),
    });
    fc.assert(
      fc.property(
        candArb,
        fc.option(fc.nat(50), { nil: null }),
        fc.string(),
        (c, major, pkg) => {
          const v = gate.c7Verdict(c as Cand, major, pkg);
          return (
            Number.isInteger(v.rank) &&
            v.rank >= 0 &&
            v.rank <= 6 &&
            v.label.length > 0
          );
        },
      ),
    );
  });
});

describe("c7Search", () => {
  it("slims results, caches them, and sends the key as Authorization", async () => {
    let seenHeaders: Record<string, string> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      seenHeaders = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          results: [
            {
              id: "/a/b",
              title: "B",
              branch: "main",
              versions: ["v1"],
              lastUpdateDate: `${TODAY}T10:00:00Z`,
              benchmarkScore: 80,
              extra: 1,
            },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const cache = memCache();
    const r1 = await gate.c7Search("b", "npm", {
      fetchImpl,
      cache,
      apiKey: "ctx7sk-secret",
    });
    expect(r1).toEqual({
      results: [
        {
          id: "/a/b",
          title: "B",
          branch: "main",
          versions: ["v1"],
          updated: TODAY,
          bench: 80,
        },
      ],
    });
    expect(seenHeaders.Authorization).toBe("ctx7sk-secret");
    const r2 = await gate.c7Search("b", "npm", {
      fetchImpl: fakeFetch({ results: [] }),
      cache,
    });
    expect(r2).toEqual(r1);
  });

  it("reports HTTP and thrown errors without leaking the key", async () => {
    expect(
      await gate.c7Search("b", "npm", {
        fetchImpl: fakeFetch({}, 429),
        cache: memCache(),
      }),
    ).toEqual({ error: "HTTP 429" });
    const throwing = (async () => {
      throw new Error("boom ctx7sk-abc123");
    }) as unknown as typeof fetch;
    const r = await gate.c7Search("b", "npm", {
      fetchImpl: throwing,
      cache: memCache(),
      apiKey: "ctx7sk-abc123",
    });
    expect(r).toEqual({ error: "boom REDACTED" });
  });
});

describe("docSources", () => {
  const row = (over: Partial<DepRow>): DepRow => ({
    name: "@inertiajs/react",
    version: "3.3.1",
    dev: false,
    ecosystem: "npm",
    ...over,
  });

  it("skips dev rows, marks fetchable ids, and flags anonymous queries", async () => {
    const fetchImpl = fakeFetch({
      results: [
        {
          id: "/websites/inertiajs_v3",
          branch: "main",
          versions: [],
          lastUpdateDate: TODAY,
        },
      ],
    });
    const g = await gate.docSources(
      [row({}), row({ name: "vitest", dev: true })],
      { fetchImpl, cache: memCache() },
    );
    expect(g.anonymous).toBe(true);
    expect(g.perPackage).toHaveLength(1);
    expect(g.perPackage[0]?.verdicts[0]).toMatchObject({
      id: "/websites/inertiajs_v3",
      mark: "✅",
    });
    expect(g.fetchable).toEqual([
      {
        id: "/websites/inertiajs_v3",
        name: "@inertiajs/react",
        version: "3.3.1",
      },
    ]);
  });

  it("reports error, no-match, and no-usable outcomes", async () => {
    const err = await gate.docSources([row({})], {
      fetchImpl: fakeFetch({}, 500),
      cache: memCache(),
      apiKey: "k",
    });
    expect(err.perPackage[0]?.error).toBe("HTTP 500");
    expect(err.anonymous).toBe(false);
    const none = await gate.docSources([row({})], {
      fetchImpl: fakeFetch({ results: [] }),
      cache: memCache(),
    });
    expect(none.perPackage[0]?.noMatch).toBe(true);
    const stale = await gate.docSources([row({})], {
      fetchImpl: fakeFetch({
        results: [
          { id: "/websites/inertiajs_v2", branch: "main", versions: [] },
        ],
      }),
      cache: memCache(),
    });
    expect(stale.perPackage[0]?.noUsable).toBe(true);
    expect(stale.fetchable).toEqual([]);
  });
});
