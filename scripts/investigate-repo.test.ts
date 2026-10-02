import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Symbol = { name: string; file: string; kind: "php" | "ts" };

type RepoModule = {
  TS_EXT_RE: RegExp;
  collectFiles: (p: string) => string[];
  tsExports: (text: string) => string[];
  deriveSymbols: (
    files: string[],
    repoRoot: string,
    maxSymbols: number,
  ) => { symbols: Symbol[]; truncated: boolean };
  resolveRepo: (targetArg: string) => {
    target: string;
    repoRoot: string;
    repoName: string;
    relTarget: string;
  };
};

type ExecModule = {
  probe: (cmd: string, env?: NodeJS.ProcessEnv) => boolean;
  run: (
    cmd: string,
    args: string[],
    opts?: { cwd?: string },
  ) => { status: number | null; stdout: string };
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

const repo: RepoModule = (await import(
  pathToFileURL(join(libDir, "repo.mjs")).href
)) as RepoModule;
const exec: ExecModule = (await import(
  pathToFileURL(join(libDir, "exec.mjs")).href
)) as ExecModule;

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-repo-"));
  git(cwd, "init", "-q", "-b", "main");
  mkdirSync(join(cwd, "app", "Services"), { recursive: true });
  mkdirSync(join(cwd, "src", "lib"), { recursive: true });
  mkdirSync(join(cwd, "tests", "Unit"), { recursive: true });
  mkdirSync(join(cwd, "app", "Services", ".hidden"), { recursive: true });
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.php"),
    "<?php\nclass Invoice {}\n",
  );
  writeFileSync(join(cwd, "app", "Services", "index.php"), "<?php\n");
  writeFileSync(join(cwd, "app", "Services", ".hidden", "X.php"), "<?php\n");
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.test.ts"),
    "export const a = 1;\n",
  );
  writeFileSync(
    join(cwd, "src", "lib", "commands.ts"),
    "export function formatDate(d: Date): string { return d.toISOString(); }\nexport const parseDate = (s: string): Date => new Date(s);\nconst hidden = 1;\nexport default function main() {}\n",
  );
  writeFileSync(join(cwd, "src", "lib", "README.md"), "# nope\n");
  writeFileSync(join(cwd, "tests", "Unit", "InvoiceTest.php"), "<?php\n");
  return cwd;
}

describe("collectFiles", () => {
  it("keeps source files and drops tests, hidden dirs, and non-source files", () => {
    const cwd = makeRepo();
    const files = repo.collectFiles(join(cwd, "app", "Services"));
    expect(files).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "app", "Services", "index.php"),
    ]);
  });

  it("collects files when the repo lives under an ancestor directory named tests", () => {
    const base = mkdtempSync(join(tmpdir(), "investigate-ancestor-"));
    const cwd = join(base, "tests", "repo");
    mkdirSync(join(cwd, "app", "Services"), { recursive: true });
    mkdirSync(join(cwd, "tests", "Unit"), { recursive: true });
    writeFileSync(join(cwd, "app", "Services", "Invoice.php"), "<?php\n");
    writeFileSync(join(cwd, "tests", "Unit", "InvoiceTest.php"), "<?php\n");
    expect(repo.collectFiles(join(cwd, "app", "Services"))).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
    ]);
    expect(repo.collectFiles(cwd)).toEqual([
      join(cwd, "app", "Services", "Invoice.php"),
    ]);
    expect(
      repo.collectFiles(join(cwd, "app", "Services", "Invoice.php")),
    ).toEqual([join(cwd, "app", "Services", "Invoice.php")]);
  });

  it("keeps .mjs, .cjs, .mts, and .cts sources and drops their test variants", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-modext-"));
    for (const f of [
      "a.mjs",
      "b.cjs",
      "c.mts",
      "d.cts",
      "a.test.mjs",
      "b.spec.cjs",
      "c.test.mts",
      "d.stories.cts",
    ]) {
      writeFileSync(join(cwd, f), "export const value = 1;\n");
    }
    expect(repo.collectFiles(cwd)).toEqual(
      ["a.mjs", "b.cjs", "c.mts", "d.cts"].map((f) => join(cwd, f)),
    );
    expect(repo.collectFiles(join(cwd, "a.test.mjs"))).toEqual([]);
  });

  it("returns a single file when given a file", () => {
    const cwd = makeRepo();
    const f = join(cwd, "src", "lib", "commands.ts");
    expect(repo.collectFiles(f)).toEqual([f]);
  });
});

describe("tsExports", () => {
  it("lists exported declarations in order, skipping non-exports and anonymous default", () => {
    expect(
      repo.tsExports(
        "export function formatDate() {}\nexport const parseDate = 1;\nconst hidden = 1;\nexport default function () {}\nexport class Store {}\nexport type Row = 1;\nexport interface Shape {}\nexport enum Color {}\nexport async function load() {}\nexport default function main() {}\n",
      ),
    ).toEqual([
      "formatDate",
      "parseDate",
      "Store",
      "Row",
      "Shape",
      "Color",
      "load",
      "main",
    ]);
  });

  it("names const enums and declared exports", () => {
    expect(
      repo.tsExports(
        "export const enum Dir {}\nexport declare function foo(): void;\nexport declare const bar: number;\n",
      ),
    ).toEqual(["Dir", "foo", "bar"]);
  });

  it("dedupes repeated names", () => {
    expect(
      repo.tsExports("export const a = 1;\nexport { a };\nexport const a = 2;"),
    ).toEqual(["a"]);
  });
});

describe("TS_EXT_RE", () => {
  it("matches every JS/TS module variant and nothing else", () => {
    for (const f of [
      "a.ts",
      "a.tsx",
      "a.js",
      "a.jsx",
      "a.mjs",
      "a.cjs",
      "a.mts",
      "a.cts",
    ]) {
      expect(repo.TS_EXT_RE.test(f)).toBe(true);
    }
    for (const f of ["a.php", "a.json", "a.mtsx", "a.d", "a.cs"]) {
      expect(repo.TS_EXT_RE.test(f)).toBe(false);
    }
  });
});

describe("deriveSymbols", () => {
  it("names the exports of a .mjs file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "investigate-mjs-"));
    const file = join(cwd, "render-comments.mjs");
    writeFileSync(
      file,
      "export function renderComments() {}\nexport const parseFindings = 1;\n",
    );
    expect(repo.deriveSymbols([file], cwd, 15).symbols).toEqual([
      { name: "renderComments", file: "render-comments.mjs", kind: "ts" },
      { name: "parseFindings", file: "render-comments.mjs", kind: "ts" },
    ]);
  });

  it("uses the basename for PHP and the exports for TypeScript, skipping generic and short names", () => {
    const cwd = makeRepo();
    const files = [
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "app", "Services", "index.php"),
      join(cwd, "src", "lib", "commands.ts"),
    ];
    const { symbols, truncated } = repo.deriveSymbols(files, cwd, 15);
    expect(truncated).toBe(false);
    expect(symbols).toEqual([
      { name: "Invoice", file: "app/Services/Invoice.php", kind: "php" },
      { name: "formatDate", file: "src/lib/commands.ts", kind: "ts" },
      { name: "parseDate", file: "src/lib/commands.ts", kind: "ts" },
      { name: "main", file: "src/lib/commands.ts", kind: "ts" },
    ]);
  });

  it("caps the symbol list and reports truncation", () => {
    const cwd = makeRepo();
    const files = [
      join(cwd, "app", "Services", "Invoice.php"),
      join(cwd, "src", "lib", "commands.ts"),
    ];
    const { symbols, truncated } = repo.deriveSymbols(files, cwd, 2);
    expect(symbols.map((s) => s.name)).toEqual(["Invoice", "formatDate"]);
    expect(truncated).toBe(true);
  });
});

describe("resolveRepo", () => {
  it("resolves root, name, and relative target for a directory inside a git repo", () => {
    const cwd = makeRepo();
    const r = repo.resolveRepo(join(cwd, "app", "Services"));
    expect(r.relTarget).toBe("app/Services");
    expect(r.repoName).toBe(cwd.split("/").pop());
  });

  it("throws for a missing target and for a path outside git", () => {
    expect(() => repo.resolveRepo("/definitely/not/here")).toThrow(
      /does not exist/,
    );
    const plain = mkdtempSync(join(tmpdir(), "investigate-nogit-"));
    expect(() => repo.resolveRepo(plain)).toThrow(
      /not inside a git repository/,
    );
  });
});

describe("probe", () => {
  it("is true for git and false for a missing binary", () => {
    expect(exec.probe("git")).toBe(true);
    expect(exec.probe("definitely-not-a-binary-xyz")).toBe(false);
  });
});
