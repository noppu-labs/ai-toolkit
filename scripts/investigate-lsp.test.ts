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
type PhpModule = {
  phpantomTypes: (
    ctx: { repoRoot: string; repoName: string; env: NodeJS.ProcessEnv },
    files: string[],
    cmd?: string,
  ) => Promise<Map<string, Array<{ name: string; detail: string }>> | null>;
};
type TsModule = {
  tsLspCallers: (
    ctx: { repoRoot: string; repoName: string; env: NodeJS.ProcessEnv },
    files: string[],
    cmd?: string,
  ) => Promise<Map<
    string,
    {
      symbol: string;
      rows: Array<{ name: string; loc: string; sites: number }>;
    }
  > | null>;
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

function makeRoot(): {
  repoRoot: string;
  repoName: string;
  env: NodeJS.ProcessEnv;
} {
  const repoRoot = mkdtempSync(join(tmpdir(), "investigate-lsp-"));
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
  return { repoRoot, repoName: "x", env: process.env };
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
    expect(out?.get(file)).toEqual([
      { name: "find", detail: "find(int $id): ?Invoice" },
      { name: "__construct", detail: "__construct(Repo $r)" },
    ]);
  });

  it("returns null when the binary is missing", async () => {
    expect(
      await php.phpantomTypes(makeRoot(), ["x.php"], "definitely-missing-lsp"),
    ).toBeNull();
  });
});

describe("tsLspCallers", () => {
  it("returns incoming callers for the primary symbol", async () => {
    const ctx = makeRoot();
    const file = join(ctx.repoRoot, "src", "formatDate.ts");
    const out = await ts.tsLspCallers(ctx, [file], fake);
    expect(out?.get(file)).toEqual({
      symbol: "formatDate",
      rows: [
        { name: "Home", loc: "src/pages/Home.tsx:10", sites: 2 },
        { name: "Nav", loc: "src/Nav.tsx:2", sites: 1 },
      ],
    });
  });
});
