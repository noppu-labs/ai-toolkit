import { mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { DepRow, KeyCache } from "./fixtures/investigate-types.ts";

type Cand = {
  id: string;
  title?: string | undefined;
  branch?: string | undefined;
  versions: unknown[];
  updated: string;
  bench?: number | undefined;
};
type Verdict = { rank: number; label: string };
type GateRow = Pick<DepRow, "name" | "version" | "dev" | "ecosystem">;
type Gate = {
  perPackage: Array<{
    row: GateRow;
    verdicts: Array<{ id: string; mark: string; label: string }>;
    error?: string;
    noMatch?: boolean;
    noUsable?: boolean;
  }>;
  fetchable: Array<{ id: string; name: string; version: string }>;
  anonymous: boolean;
};
type CacheModule = {
  TtlCache: new (dir: string, ttlMs: number) => KeyCache;
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
  ) => string | number | undefined;
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
      cache: KeyCache;
      apiKey?: string;
      searchUrl?: string;
    },
  ) => Promise<{ results: Cand[] } | { error: string }>;
  scoreCandidates: (
    results: Cand[],
    row: { name: string; version: string; ecosystem: string },
  ) => Array<{ c: Cand; v: Verdict }>;
  docSources: (
    rows: GateRow[],
    deps: {
      fetchImpl: typeof fetch;
      cache: KeyCache;
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

function memCache(): KeyCache & { store: Map<string, unknown> } {
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

  // Oracle: the versions are generated as tuples, so the expected pin is the
  // lexicographically highest tuple of the installed major, found without bestPin's comparator.
  it("returns the highest dotted version of the installed major", () => {
    const tuple = fc.tuple(fc.nat(5), fc.nat(20), fc.nat(20));
    fc.assert(
      fc.property(
        fc.array(fc.record({ t: tuple, v: fc.boolean() }), { minLength: 1 }),
        fc.nat(5),
        (entries, major) => {
          const versions = entries.map(
            ({ t, v }) => `${v ? "v" : ""}${t.join(".")}`,
          );
          const same = entries
            .map((e) => e.t)
            .filter(([m]) => m === major)
            .sort((a, b) => b[0] - a[0] || b[1] - a[1] || b[2] - a[2]);
          const r = gate.bestPin(versions, major);
          if (same.length === 0) return r === undefined;
          return String(r).replace(/^v/, "") === (same[0] ?? []).join(".");
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
    [{ id: "/acme/trusted-types", branch: "3.x" }, 3, 0, /USE UNPINNED/],
    [
      { id: "/acme/react-lib", title: "React and Vue adapters" },
      3,
      6,
      /DIFFERENT STACK \(mentions "Vue"\)/,
    ],
  ])("%j with installed %i → rank %i", (over, major, rank, label) => {
    const v = gate.c7Verdict(cand(over), major, "@inertiajs/react");
    expect(v.rank).toBe(rank);
    expect(v.label).toMatch(label);
  });

  it("reports an unparsed installed version as rank 4", () => {
    expect(gate.c7Verdict(cand({}), null, "x").rank).toBe(4);
  });

  it("tests every stack token, skipping one that is part of the package name", () => {
    expect(
      gate.c7Verdict(
        cand({ id: "/acme/laravel-x", title: "Laravel Rails bridge" }),
        3,
        "acme/laravel-x",
      ).label,
    ).toMatch(/mentions "Rails"/);
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
          const v = gate.c7Verdict(c, major, pkg);
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

describe("scoreCandidates", () => {
  it("demotes a loose name match by 3 ranks and labels it, without dropping it", () => {
    const scored = gate.scoreCandidates(
      [
        cand({ id: "/facebook/react", branch: "3.x" }),
        cand({ id: "/inertiajs/inertia", branch: "2.x" }),
      ],
      { name: "@inertiajs/react", version: "3.3.1", ecosystem: "npm" },
    );
    expect(scored.map((s) => [s.c.id, s.v.rank])).toEqual([
      ["/facebook/react", 3],
      ["/inertiajs/inertia", 5],
    ]);
    expect(scored[0]?.v.label).toBe(
      "NAME MISMATCH — confirm this is really @inertiajs/react; USE UNPINNED — branch 3.x == installed v3",
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
    expect(seenHeaders.Authorization).toBe("Bearer ctx7sk-secret");
    const r2 = await gate.c7Search("b", "npm", {
      fetchImpl: fakeFetch({ results: [] }),
      cache,
    });
    expect(r2).toEqual(r1);
  });

  it("queries the override URL with the encoded query", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ results: [] }));
    }) as unknown as typeof fetch;
    await gate.c7Search("@inertiajs/react", "npm", {
      fetchImpl,
      cache: memCache(),
      searchUrl: "http://127.0.0.1:1/search",
    });
    await gate.c7Search("spatie/laravel-data", "composer", {
      fetchImpl,
      cache: memCache(),
    });
    expect(urls).toEqual([
      "http://127.0.0.1:1/search?query=inertiajs",
      "https://context7.com/api/v1/search?query=spatie%2Flaravel-data",
    ]);
  });

  it("drops results without a string id and reports a reply with no results array", async () => {
    const mixed = await gate.c7Search("b", "npm", {
      fetchImpl: fakeFetch({ results: [{ id: 3 }, { id: "/a/b" }, null] }),
      cache: memCache(),
    });
    expect(mixed).toMatchObject({ results: [{ id: "/a/b" }] });
    const cache = memCache();
    expect(
      await gate.c7Search("b", "npm", {
        fetchImpl: fakeFetch({ libraries: [] }),
        cache,
      }),
    ).toEqual({ error: "unexpected context7 reply (no results array)" });
    expect(cache.store.size).toBe(0);
  });

  it("refetches when the cached results are not an array of candidates", async () => {
    const searches = [
      { results: [1, "x"] },
      { results: [null] },
      { results: [{ foo: 1 }] },
    ].map((bad) => {
      const cache = memCache();
      cache.put("b", bad);
      return gate.c7Search("b", "npm", {
        fetchImpl: fakeFetch({ results: [] }),
        cache,
      });
    });
    expect(await Promise.all(searches)).toEqual([
      { results: [] },
      { results: [] },
      { results: [] },
    ]);
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
  const row = (over: Partial<GateRow>): GateRow => ({
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

  it("lists a rank-2 pin in the fetch list as <id>/<pin>", async () => {
    const g = await gate.docSources(
      [row({ name: "pinlib", version: "3.3.1" })],
      {
        fetchImpl: fakeFetch({
          results: [
            {
              id: "/acme/pinlib",
              branch: "2.x",
              versions: ["v3.3.0", "v2.9.0"],
              lastUpdateDate: TODAY,
            },
          ],
        }),
        cache: memCache(),
      },
    );
    expect(g.perPackage[0]?.verdicts[0]).toMatchObject({
      id: "/acme/pinlib",
      mark: "✅",
    });
    expect(g.fetchable).toEqual([
      { id: "/acme/pinlib/v3.3.0", name: "pinlib", version: "3.3.1" },
    ]);
  });

  it("looks up at most 12 non-dev packages", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ results: [] }));
    }) as unknown as typeof fetch;
    const rows = Array.from({ length: 14 }, (_, i) => row({ name: `pkg${i}` }));
    const g = await gate.docSources(rows, { fetchImpl, cache: memCache() });
    expect(calls).toBe(12);
    expect(g.perPackage.map((e) => e.row.name)).toEqual(
      rows.slice(0, 12).map((r) => r.name),
    );
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
