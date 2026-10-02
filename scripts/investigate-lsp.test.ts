import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type FrameParser = { push: (chunk: Buffer) => unknown[] };
type LspModule = {
  FrameParser: new () => FrameParser;
  flattenSymbols: (syms: unknown[]) => Array<{ name: string }>;
};
type Outcome<T> =
  | { results: Map<string, T>; failures: string[]; total: number }
  | { error: string };
type LspCtx = { repoRoot: string; repoName: string; env: NodeJS.ProcessEnv };
type PhpModule = {
  phpantomTypes: (
    ctx: LspCtx,
    files: string[],
    cmd?: string,
  ) => Promise<Outcome<Array<{ name: string; detail: string }>>>;
};
type TsModule = {
  tsLspCallers: (
    ctx: LspCtx,
    files: string[],
    cmd?: string,
  ) => Promise<
    Outcome<{
      symbol: string;
      rows: Array<{ name: string; loc: string; sites: number }>;
    }>
  >;
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
const fake: string = join(
  import.meta.dirname,
  "fixtures",
  "fake-lsp-server.mjs",
);
chmodSync(fake, 0o755);
const lsp: LspModule = (await import(
  pathToFileURL(join(libDir, "lsp-client.mjs")).href
)) as LspModule;
const php: PhpModule = (await import(
  pathToFileURL(join(libDir, "phpantom.mjs")).href
)) as PhpModule;
const ts: TsModule = (await import(
  pathToFileURL(join(libDir, "ts-lsp.mjs")).href
)) as TsModule;

function frame(obj: unknown): Buffer {
  const s = JSON.stringify(obj);
  return Buffer.from(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
}

function makeRoot(prefix = "investigate-lsp-"): LspCtx {
  const repoRoot = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(repoRoot, "app"));
  mkdirSync(join(repoRoot, "src"));
  writeFileSync(
    join(repoRoot, "app", "Invoice.php"),
    "<?php\nclass Invoice {}\n",
  );
  writeFileSync(
    join(repoRoot, "src", "formatDate.ts"),
    "export function formatDate() {}\n",
  );
  writeFileSync(
    join(repoRoot, "app", "Broken.php"),
    "<?php\nclass Broken {}\n",
  );
  return { repoRoot, repoName: "x", env: process.env };
}

function resultsOf<T>(outcome: Outcome<T>): Map<string, T> {
  if ("error" in outcome) throw new Error(`unexpected error ${outcome.error}`);
  return outcome.results;
}

describe("FrameParser", () => {
  it("decodes messages split across chunks and skips malformed frames", () => {
    const p = new lsp.FrameParser();
    const whole = Buffer.concat([
      frame({ id: 1 }),
      Buffer.from("Content-Length: 5\r\n\r\n{bad}"),
      frame({ id: 2 }),
    ]);
    const out = [
      ...p.push(whole.subarray(0, 10)),
      ...p.push(whole.subarray(10)),
    ];
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("drops a headerless preamble", () => {
    const p = new lsp.FrameParser();
    expect(
      p.push(
        Buffer.concat([Buffer.from("garbage\r\n\r\n"), frame({ ok: true })]),
      ),
    ).toEqual([{ ok: true }]);
  });
});

describe("flattenSymbols", () => {
  it("returns parents and nested children in order", () => {
    const syms = [
      { name: "A", children: [{ name: "B", children: [{ name: "C" }] }] },
      { name: "D" },
    ];
    expect(lsp.flattenSymbols(syms).map((s) => s.name)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });
});

describe("phpantomTypes", () => {
  it("returns resolved method signatures per file through the fake server", async () => {
    const ctx = makeRoot();
    const file = join(ctx.repoRoot, "app", "Invoice.php");
    const out = await php.phpantomTypes(ctx, [file], fake);
    expect(resultsOf(out).get(file)).toEqual([
      { name: "find", detail: "find(int $id): ?Invoice" },
      { name: "__construct", detail: "__construct(Repo $r)" },
    ]);
    expect(out).toMatchObject({ failures: [], total: 1 });
  });

  it("reports the server's message and stderr when initialize fails", async () => {
    const ctx = {
      ...makeRoot(),
      env: { ...process.env, FAKE_LSP_FAIL_INIT: "1" },
    };
    const out = await php.phpantomTypes(
      ctx,
      [join(ctx.repoRoot, "app", "Invoice.php")],
      fake,
    );
    expect(out).toEqual({
      error:
        "initialize: Could not find a valid installation; stderr: fake: no TypeScript install found",
    });
  });

  it("fails fast and counts every file once the server exits after initialize", async () => {
    const ctx = {
      ...makeRoot(),
      env: { ...process.env, FAKE_LSP_EXIT_AFTER_INIT: "1" },
    };
    const files = [
      join(ctx.repoRoot, "app", "Invoice.php"),
      join(ctx.repoRoot, "app", "Broken.php"),
    ];
    const started = Date.now();
    const out = await php.phpantomTypes(ctx, files, fake);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(resultsOf(out).size).toBe(0);
    expect(out).toMatchObject({ total: 2 });
    expect("failures" in out && out.failures).toHaveLength(2);
  });

  it("counts a per-file request error without dropping the other files", async () => {
    const ctx = {
      ...makeRoot(),
      env: { ...process.env, FAKE_LSP_FAIL_URI_MATCH: "Broken" },
    };
    const ok = join(ctx.repoRoot, "app", "Invoice.php");
    const out = await php.phpantomTypes(
      ctx,
      [ok, join(ctx.repoRoot, "app", "Broken.php")],
      fake,
    );
    expect([...resultsOf(out).keys()]).toEqual([ok]);
    expect(out).toMatchObject({
      failures: ["textDocument/documentSymbol: fake request failure"],
      total: 2,
    });
  });

  it("reports a spawn error when the binary is missing", async () => {
    expect(
      await php.phpantomTypes(makeRoot(), ["x.php"], "definitely-missing-lsp"),
    ).toEqual({ error: expect.stringContaining("ENOENT") });
  });
});

describe("tsLspCallers", () => {
  it("returns incoming callers for the primary symbol", async () => {
    const ctx = makeRoot();
    const file = join(ctx.repoRoot, "src", "formatDate.ts");
    const out = await ts.tsLspCallers(ctx, [file], fake);
    expect(resultsOf(out).get(file)).toEqual({
      symbol: "formatDate",
      rows: [
        { name: "Home", loc: "src/pages/Home.tsx:10", sites: 2 },
        { name: "Nav", loc: "src/Nav.tsx:2", sites: 1 },
      ],
    });
  });

  it("encodes and decodes file URIs for a root with a space and a hash", async () => {
    const ctx = makeRoot("investigate lsp #");
    const file = join(ctx.repoRoot, "src", "formatDate.ts");
    const out = await ts.tsLspCallers(ctx, [file], fake);
    expect(resultsOf(out).get(file)?.rows[0]?.loc).toBe(
      "src/pages/Home.tsx:10",
    );
  });

  it("counts a failed call-hierarchy request as a failed file", async () => {
    const ctx = {
      ...makeRoot(),
      env: {
        ...process.env,
        FAKE_LSP_FAIL_METHOD: "callHierarchy/incomingCalls",
      },
    };
    const out = await ts.tsLspCallers(
      ctx,
      [join(ctx.repoRoot, "src", "formatDate.ts")],
      fake,
    );
    expect(resultsOf(out).size).toBe(0);
    expect(out).toMatchObject({
      failures: ["callHierarchy/incomingCalls: fake request failure"],
      total: 1,
    });
  });
});
