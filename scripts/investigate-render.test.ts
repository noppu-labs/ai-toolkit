import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import type { DepRow, Sym, TsCallers } from "./fixtures/investigate-types.ts";

type Gate = {
  perPackage: Array<{
    row: Pick<DepRow, "name" | "version">;
    verdicts: Array<{ id: string; mark: string; label: string; meta: string }>;
    error?: string;
    noMatch?: boolean;
    noUsable?: boolean;
  }>;
  fetchable: Array<{ id: string; name: string; version: string }>;
  anonymous: boolean;
};
type Parts = {
  dupes: string[];
  typeRows: Array<{ detail: string }> | null;
  tsCallers: TsCallers | null;
  graph: unknown;
  freshnessOk: boolean;
  wiring: Record<string, never[]> | null;
};
type RenderModule = {
  renderDependencies: (rows: DepRow[], unread: string[]) => string[];
  renderDocSources: (
    gate: Gate | null,
    skippedReason: string | null,
  ) => string[];
  renderCodegraph: (lines: string[] | null) => string[];
  renderSymbol: (sym: Sym, parts: Parts) => string[];
};

const render: RenderModule = (await import(
  pathToFileURL(
    join(
      import.meta.dirname,
      "..",
      "investigate",
      "skills",
      "brief",
      "scripts",
      "lib",
      "render.mjs",
    ),
  ).href
)) as RenderModule;

const SYM: Sym = { name: "Invoice", file: "app/Invoice.php", kind: "php" };
const NO_PARTS: Parts = {
  dupes: [],
  typeRows: null,
  tsCallers: null,
  graph: null,
  freshnessOk: false,
  wiring: {},
};

function dep(over: Partial<DepRow>): DepRow {
  return {
    name: "acme/a",
    version: "1.0.0",
    dev: false,
    ecosystem: "composer",
    path: "vendor/acme/a",
    ambiguous: null,
    importedAs: ["Acme\\A"],
    ...over,
  };
}

describe("renderDependencies", () => {
  it("flags an ambiguous namespace and caps the imported-as list", () => {
    const lines = render.renderDependencies(
      [
        dep({
          dev: true,
          ambiguous: ["acme/a", "acme/b"],
          importedAs: ["A\\1", "A\\2", "A\\3", "A\\4", "A\\5", "A\\6"],
        }),
      ],
      [],
    );
    expect(lines).toContain(
      "- **acme/a** 1.0.0 (dev) — read at `vendor/acme/a`",
    );
    expect(lines).toContain(
      "    - ⚠ AMBIGUOUS: acme/a and acme/b both declare this namespace — confirm which one owns the class before citing it.",
    );
    expect(lines).toContain(
      "    - imported as: A\\1, A\\2, A\\3, A\\4, … 2 more",
    );
  });

  it("renders nothing with no rows and no unread lockfile", () => {
    expect(render.renderDependencies([], [])).toEqual([]);
  });
});

describe("renderDocSources", () => {
  const gate = (over: Partial<Gate>): Gate => ({
    perPackage: [],
    fetchable: [],
    anonymous: false,
    ...over,
  });

  it("lists each verdict, the no-usable line, failures, and no-match", () => {
    const lines = render.renderDocSources(
      gate({
        anonymous: true,
        perPackage: [
          {
            row: { name: "old", version: "3.0.0" },
            verdicts: [
              { id: "/o/v2", mark: "⚠", label: "STALE — x", meta: "m" },
            ],
            noUsable: true,
          },
          {
            row: { name: "down", version: "1.0.0" },
            verdicts: [],
            error: "HTTP 500",
          },
          {
            row: { name: "gone", version: "2.0.0" },
            verdicts: [],
            noMatch: true,
          },
        ],
      }),
      null,
    );
    expect(lines).toContain(
      "> CONTEXT7_API_KEY not set — queried anonymously (results may be rate-limited).",
    );
    expect(lines).toContain("- **old** 3.0.0 (installed major: 3)");
    expect(lines).toContain("    - ⚠ `/o/v2` — STALE — x");
    expect(lines).toContain("        (m)");
    expect(lines).toContain(
      "    - ⛔ NO USABLE DOCS for the installed version — hand no id to the agents; read installed source.",
    );
    expect(lines).toContain(
      "    - lookup FAILED (HTTP 500) — treat doc coverage as UNRESOLVED, read installed source",
    );
    expect(lines).toContain("    - no context7 match — read installed source");
    expect(lines).toContain(
      "**FETCH BEFORE CLAIMING** — nothing cleared the version gate. Read installed source for",
    );
  });

  it("lists every fetchable id under FETCH BEFORE CLAIMING", () => {
    const lines = render.renderDocSources(
      gate({
        fetchable: [
          { id: "/a/b", name: "b", version: "1.0.0" },
          { id: "/c/d/v2.1.0", name: "d", version: "2.1.3" },
        ],
      }),
      null,
    );
    expect(lines.slice(-3)).toEqual([
      "- `/a/b` — b 1.0.0",
      "- `/c/d/v2.1.0` — d 2.1.3",
      "",
    ]);
  });
});

describe("renderCodegraph", () => {
  it("renders the lines under a heading, or nothing", () => {
    expect(render.renderCodegraph(null)).toEqual([]);
    expect(render.renderCodegraph(["a"])).toEqual([
      "## Module graph (codegraph — includes inheritance edges the gitnexus PHP graph lacks)",
      "",
      "a",
      "",
    ]);
  });
});

describe("renderSymbol", () => {
  it("renders resolved types and verified callers", () => {
    const lines = render.renderSymbol(SYM, {
      ...NO_PARTS,
      typeRows: [{ detail: "find(int $id): ?Invoice" }],
      tsCallers: {
        symbol: "Invoice",
        rows: [
          { name: "Home", loc: "src/Home.tsx:3", sites: 2 },
          { name: "Nav", loc: "src/Nav.tsx:9", sites: 1 },
        ],
      },
    });
    expect(lines).toEqual([
      "## Invoice (app/Invoice.php)",
      "- resolved types (phpantom, 1 methods):",
      "    - find(int $id): ?Invoice",
      "- verified callers (ts-lsp incomingCalls on Invoice, 2 shown):",
      "    - Home (src/Home.tsx:3, 2 call sites)",
      "    - Nav (src/Nav.tsx:9, 1 call site)",
      "- no external references found outside the target (still verify: dynamic/string-based usage is invisible to this scan)",
      "",
    ]);
  });

  it("omits graph lines when the index is unavailable and reports a symbol it lacks", () => {
    expect(render.renderSymbol(SYM, NO_PARTS).join("\n")).not.toContain(
      "graph",
    );
    expect(
      render.renderSymbol(SYM, { ...NO_PARTS, freshnessOk: true, graph: null }),
    ).toContain("- graph: symbol not found in index");
  });

  it("skips a graph symbol that resolves to another file", () => {
    expect(
      render.renderSymbol(SYM, {
        ...NO_PARTS,
        freshnessOk: true,
        graph: { symbol: { filePath: "lib/Invoice.php" } },
      }),
    ).toContain(
      "- graph: name collision — resolves to lib/Invoice.php, skipped",
    );
  });

  it("renders graph location, boundaries, capped callers and importers, and processes", () => {
    const many = (n: number, prefix: string): Array<Record<string, string>> =>
      Array.from({ length: n }, (_, i) => ({
        name: `${prefix}${i}`,
        filePath: `app/${prefix}${i}.php`,
      }));
    const lines = render.renderSymbol(SYM, {
      ...NO_PARTS,
      freshnessOk: true,
      graph: {
        symbol: {
          kind: "Class",
          filePath: "app/Invoice.php",
          startLine: 3,
          endLine: 40,
        },
        epistemic: "graph",
        boundaries: ["http"],
        incoming: { calls: many(12, "C"), imports: many(2, "I") },
        processes: ["p1", { name: "p2" }, "p3", "p4", "p5", "p6"],
      },
    });
    expect(lines).toContain(
      "- graph: Class at app/Invoice.php:3-40 (epistemic: graph)",
    );
    expect(lines).toContain("- graph boundary: http");
    expect(lines).toContain("- graph callers (12, lower bound):");
    expect(lines).toContain("    - C9 (app/C9.php)");
    expect(lines).not.toContain("    - C10 (app/C10.php)");
    expect(lines).toContain("- graph importers (2):");
    expect(lines).toContain("    - app/I1.php");
    expect(lines).toContain("- graph processes: p1, p2, p3, p4, p5");
  });
});
