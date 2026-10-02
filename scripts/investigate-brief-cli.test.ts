import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { makeFakeLspPath, makeNoToolsPath } from "./fixtures/no-tools-path.ts";

type RenderModule = {
  DOCS_NO_IMPORTS: string;
  DOCS_NO_LOCKFILE: string;
  DOCS_SKIPPED: string;
  renderDocSources: (gate: null, skippedReason: string | null) => string[];
  renderDependencies: (rows: never[], unread: string[]) => string[];
  renderTools: (tools: Record<string, string>) => string[];
  renderSymbol: (
    sym: { name: string; file: string; kind: string },
    parts: {
      dupes: string[];
      typeRows: Array<{ detail: string }> | null;
      tsCallers: {
        symbol: string;
        rows: Array<{ name: string; loc: string; sites: number }>;
      } | null;
      graph: unknown | null;
      freshnessOk: boolean;
      wiring: Record<
        string,
        Array<{ filePath: string; lineNo: string; text: string }>
      > | null;
    },
  ) => string[];
};
type CliModule = {
  parseArgs: (argv: string[]) => {
    target: string | null;
    maxSymbols: number;
    noDocs: boolean;
    noLsp: boolean;
    help: boolean;
  };
  USAGE: string;
  lspStatus: (
    outcome:
      | { results: Map<string, unknown>; failures: string[]; total: number }
      | { error: string },
  ) => string;
  callerOwners: (
    symbols: Array<{ name: string; file: string }>,
    tsLsp: Map<string, { symbol: string }> | null,
    repoRoot: string,
  ) => Map<string, string>;
  codegraphStatus: (s: {
    hasIndex: boolean;
    probeOk: boolean;
    lines: string[] | null;
  }) => string;
  astGrepStatus: (probeOk: boolean, hits: unknown[] | null) => string;
  context7Status: (gate: {
    perPackage: Array<{ error?: string }>;
    anonymous: boolean;
  }) => string;
  main: (
    argv: string[],
    io: {
      env: Record<string, string>;
      stdout: { write: (s: string) => void };
      stderr: { write: (s: string) => void };
    },
  ) => Promise<number>;
};

const scriptsDir: string = join(
  import.meta.dirname,
  "..",
  "investigate",
  "skills",
  "brief",
  "scripts",
);
const script: string = join(scriptsDir, "brief.mjs");
const render: RenderModule = (await import(
  pathToFileURL(join(scriptsDir, "lib", "render.mjs")).href
)) as RenderModule;
const cli: CliModule = (await import(pathToFileURL(script).href)) as CliModule;

const NO_TOOLS_PATH: string = makeNoToolsPath();
const FAKE_LSP_PATH: string = makeFakeLspPath(
  join(import.meta.dirname, "fixtures", "fake-lsp-server.mjs"),
);

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
}

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-cli-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  for (const d of [
    "app/Services",
    "app/Providers",
    "app/Http",
    "src/lib",
    "src/pages",
    "tests",
    "onlytests/tests",
  ]) {
    mkdirSync(join(cwd, d), { recursive: true });
  }
  writeFileSync(
    join(cwd, "app", "Services", "Invoice.php"),
    "<?php\nuse Spatie\\LaravelData\\Data;\nclass Invoice extends Data {}\n",
  );
  writeFileSync(
    join(cwd, "app", "Providers", "AppServiceProvider.php"),
    "<?php\n$this->app->singleton(Invoice::class, fn () => new Invoice());\n",
  );
  writeFileSync(
    join(cwd, "app", "Http", "InvoiceController.php"),
    "<?php\nclass InvoiceController { public function __construct(Invoice $invoice) {} }\n",
  );
  writeFileSync(
    join(cwd, "tests", "InvoiceTest.php"),
    "<?php\n$x = new Invoice();\n",
  );
  writeFileSync(
    join(cwd, "src", "lib", "commands.ts"),
    "export function formatDate(d: Date): string { return d.toISOString(); }\n",
  );
  writeFileSync(
    join(cwd, "src", "pages", "Home.tsx"),
    "import { formatDate } from '../lib/commands';\nconst commands = formatDate(new Date());\n",
  );
  writeFileSync(join(cwd, "onlytests", "tests", "x.php"), "<?php\n");
  writeFileSync(
    join(cwd, "composer.json"),
    JSON.stringify({ autoload: { "psr-4": { "App\\": "app/" } } }),
  );
  writeFileSync(
    join(cwd, "composer.lock"),
    JSON.stringify({
      packages: [
        {
          name: "spatie/laravel-data",
          version: "4.11.0",
          autoload: { "psr-4": { "Spatie\\LaravelData\\": "src" } },
        },
      ],
      "packages-dev": [],
    }),
  );
  writeFileSync(
    join(cwd, "package-lock.json"),
    JSON.stringify({ packages: { "": { name: "fixture" } } }),
  );
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return cwd;
}

// Enough classes, each referenced by long lines in several files, to push the
// brief past one 64 KiB pipe buffer.
function makeLargeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "investigate-cli-large-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");
  mkdirSync(join(cwd, "app", "Models"), { recursive: true });
  mkdirSync(join(cwd, "app", "Http"), { recursive: true });
  const names = Array.from(
    { length: 120 },
    (_, i) => `Model${String(i).padStart(3, "0")}`,
  );
  for (const name of names) {
    writeFileSync(
      join(cwd, "app", "Models", `${name}.php`),
      `<?php\nclass ${name} {}\n`,
    );
  }
  for (const consumer of ["A", "B", "C", "D"]) {
    const body = names
      .map((name) => `$a = new ${name}(${"x".repeat(120)});`)
      .join("\n");
    writeFileSync(
      join(cwd, "app", "Http", `${consumer}.php`),
      `<?php\n${body}\n`,
    );
  }
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  return cwd;
}

function runBriefWith(
  extraEnv: Record<string, string>,
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: { PATH: NO_TOOLS_PATH, HOME: cwd, ...extraEnv },
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function runBrief(
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  return runBriefWith({}, cwd, ...args);
}

describe("NO_TOOLS_PATH", () => {
  // npm ships beside node, as globally installed tools do under nvm, fnm, or volta.
  it("exposes node and git but nothing else from node's bin dir", () => {
    const env = { PATH: NO_TOOLS_PATH };
    expect(spawnSync("node", ["--version"], { env }).status).toBe(0);
    expect(spawnSync("git", ["--version"], { env }).status).toBe(0);
    expect(spawnSync("npm", ["--version"], { env }).error).toBeDefined();
  });
});

describe("parseArgs", () => {
  it("parses target and flags with defaults", () => {
    expect(
      cli.parseArgs(["app", "--max-symbols", "3", "--no-docs", "--no-lsp"]),
    ).toEqual({
      target: "app",
      maxSymbols: 3,
      noDocs: true,
      noLsp: true,
      help: false,
    });
    expect(cli.parseArgs([])).toMatchObject({ target: null, maxSymbols: 15 });
    expect(cli.parseArgs(["--help"])).toMatchObject({ help: true });
  });

  it.each([
    [["a", "b"], "unexpected argument b"],
    [["a", "--bogus"], "unknown option --bogus"],
    [["a", "--max-symbols"], "--max-symbols needs a positive integer"],
    [["--max-symbols", "zero", "x"], "--max-symbols needs a positive integer"],
    [["a", "--max-symbols", "0"], "--max-symbols needs a positive integer"],
    [
      ["a", "--max-symbols", "--no-docs"],
      "--max-symbols needs a positive integer",
    ],
  ])("rejects %j", (argv, reason) => {
    expect(() => cli.parseArgs(argv)).toThrow(reason);
  });
});

describe("context7Status", () => {
  const entries = (
    ...errors: Array<string | undefined>
  ): {
    perPackage: Array<{ error?: string }>;
    anonymous: boolean;
  } => ({
    perPackage: errors.map((error) => (error ? { error } : {})),
    anonymous: false,
  });

  it("separates clean, partly failed, and fully failed lookups", () => {
    expect(cli.context7Status(entries(undefined, undefined))).toBe("ran");
    expect(cli.context7Status({ ...entries(undefined), anonymous: true })).toBe(
      "ran anonymously (no CONTEXT7_API_KEY)",
    );
    expect(cli.context7Status(entries("HTTP 500", undefined, undefined))).toBe(
      "ran (1 of 3 lookups FAILED)",
    );
    expect(
      cli.context7Status({
        ...entries("HTTP 500", undefined),
        anonymous: true,
      }),
    ).toBe("ran (1 of 2 lookups FAILED, anonymous — no CONTEXT7_API_KEY)");
    expect(cli.context7Status(entries("HTTP 500", "boom"))).toBe(
      "FAILED (all 2 lookups failed)",
    );
    expect(cli.context7Status({ ...entries("boom"), anonymous: true })).toBe(
      "FAILED (all 1 lookups failed, anonymous — no CONTEXT7_API_KEY)",
    );
    expect(cli.context7Status(entries())).toBe("ran");
  });
});

describe("lspStatus", () => {
  const ran = (
    size: number,
    failures: string[] = [],
    total = 2,
  ): { results: Map<string, unknown>; failures: string[]; total: number } => ({
    results: new Map(Array.from({ length: size }, (_, i) => [`f${i}`, i])),
    failures,
    total,
  });

  it("separates failed, partial, empty, and populated servers", () => {
    expect(cli.lspStatus({ error: "initialize: boom" })).toBe(
      "FAILED (initialize: boom)",
    );
    expect(cli.lspStatus(ran(0, ["timeout: x", "timeout: y"]))).toBe(
      "FAILED (2 of 2 files failed: timeout: x)",
    );
    expect(cli.lspStatus(ran(1, ["timeout: x"]))).toBe(
      "partial (1 of 2 files failed: timeout: x)",
    );
    expect(cli.lspStatus(ran(0))).toBe("ran (no results)");
    expect(cli.lspStatus(ran(1))).toBe("ran");
  });
});

describe("callerOwners", () => {
  const syms = [
    { name: "formatDate", file: "src/a.ts" },
    { name: "parseDate", file: "src/a.ts" },
    { name: "Button", file: "src/b.tsx" },
  ];

  it("gives each file's callers to the symbol they were computed for, else the file's first symbol", () => {
    const tsLsp = new Map([
      ["/r/src/a.ts", { symbol: "parseDate" }],
      ["/r/src/b.tsx", { symbol: "b" }],
    ]);
    expect(cli.callerOwners(syms, tsLsp, "/r")).toEqual(
      new Map([
        ["src/a.ts", "parseDate"],
        ["src/b.tsx", "Button"],
      ]),
    );
    expect(cli.callerOwners(syms, null, "/r")).toEqual(new Map());
  });
});

describe("codegraphStatus", () => {
  it("separates no index, absent binary, failure, and output", () => {
    expect(
      cli.codegraphStatus({ hasIndex: false, probeOk: true, lines: null }),
    ).toBe("no .codegraph index");
    expect(
      cli.codegraphStatus({ hasIndex: true, probeOk: false, lines: null }),
    ).toBe("not on PATH");
    expect(
      cli.codegraphStatus({ hasIndex: true, probeOk: true, lines: null }),
    ).toBe("FAILED (codegraph explore exited non-zero or timed out)");
    expect(
      cli.codegraphStatus({ hasIndex: true, probeOk: true, lines: ["x"] }),
    ).toBe("ran");
  });
});

describe("astGrepStatus", () => {
  it("separates absent binary, no scan dirs, and a scan that ran", () => {
    expect(cli.astGrepStatus(false, null)).toBe("not on PATH");
    expect(cli.astGrepStatus(true, null)).toBe("skipped (no PHP scan dirs)");
    expect(cli.astGrepStatus(true, [])).toBe("ran");
  });
});

describe("main", () => {
  it("lists --help in the usage line", () => {
    expect(cli.USAGE).toBe(
      "usage: node brief.mjs <target-path> [--max-symbols N] [--no-docs] [--no-lsp] [--help]",
    );
  });

  it("turns any thrown error into a one-line stderr reason and exit 1", async () => {
    const cwd = makeRepo();
    let err = "";
    const code = await cli.main(
      [join(cwd, "src", "lib"), "--no-docs", "--no-lsp"],
      {
        env: { PATH: NO_TOOLS_PATH, HOME: cwd },
        stdout: {
          write: () => {
            throw new Error("boom");
          },
        },
        stderr: {
          write: (s: string) => {
            err += s;
          },
        },
      },
    );
    expect(code).toBe(1);
    expect(err).toBe("brief.mjs: boom\n");
  });
});

describe("brief.mjs", () => {
  it("prints usage and exits 1 without a target, exits 0 with --help", () => {
    const cwd = makeRepo();
    const r = runBrief(cwd);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("usage:");
    expect(runBrief(cwd, "--help").status).toBe(0);
  });

  it("writes the whole brief through a pipe when it exceeds 64 KiB", () => {
    const cwd = makeLargeRepo();
    const r = runBrief(
      cwd,
      "app/Models",
      "--max-symbols",
      "200",
      "--no-docs",
      "--no-lsp",
    );
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(65_536);
    expect(r.stdout).toContain("## Unresolved by construction");
  });

  it.each([
    [["src/lib", "extra"], "unexpected argument extra"],
    [["src/lib", "--bogus"], "unknown option --bogus"],
    [["src/lib", "--max-symbols", "--no-docs"], "--max-symbols needs"],
  ])(
    "rejects %j with the reason and usage on stderr and exit 1",
    (argv, reason) => {
      const r = runBrief(makeRepo(), ...argv);
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain(`brief.mjs: ${reason}`);
      expect(r.stderr).toContain(cli.USAGE);
    },
  );

  it("exits 1 for a missing target, a non-git path, and a dir with no source files", () => {
    const cwd = makeRepo();
    expect(runBrief(cwd, "nope").stderr).toContain("does not exist");
    expect(runBrief(cwd, "onlytests").stderr).toContain(
      "no source files found",
    );
    const plain = mkdtempSync(join(tmpdir(), "x-"));
    writeFileSync(join(plain, "a.php"), "<?php\n");
    expect(runBrief(plain, "a.php").stderr).toContain(
      "not inside a git repository",
    );
  });

  it("renders a Files section and zero symbol sections when every name is generic", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "generic"));
    writeFileSync(
      join(cwd, "generic", "index.ts"),
      "export const config = 1;\nexport const id = 2;\n",
    );
    const r = runBrief(cwd, "generic", "--no-docs", "--no-lsp");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## Files (1)");
    const sections = r.stdout
      .split("\n")
      .filter((l) => /^## (?!Tools|Files|Unresolved)/.test(l));
    expect(sections).toEqual([]);
  });

  it("renders a PHP module brief with the tools header, deps, and wiring, with no optional tools", () => {
    const cwd = makeRepo();
    const r = runBrief(cwd, "app/Services", "--no-docs", "--no-lsp");
    expect(r.status).toBe(0);
    const out = r.stdout;
    expect(out).toMatch(
      /^# Structural brief: app\/Services \(repo: investigate-cli-/,
    );
    expect(out).toContain("## Tools");
    expect(out).toContain("- git: ran");
    expect(out).toContain("- gitnexus: not on PATH");
    expect(out).toContain("- codegraph: no .codegraph index");
    expect(out).toContain("- ast-grep: not on PATH");
    expect(out).toContain("- phpantom_lsp: skipped (--no-lsp)");
    expect(out).toContain("- context7: skipped (--no-docs)");
    expect(out).toContain("Index: UNAVAILABLE");
    expect(out).toContain("## Files (1)");
    expect(out).toContain(
      "**spatie/laravel-data** 4.11.0 — read at `vendor/spatie/laravel-data`",
    );
    expect(out).not.toContain("## Doc sources");
    expect(out).toContain("## Invoice (app/Services/Invoice.php)");
    expect(out).toContain("- provider bindings (1):");
    expect(out).toContain("app/Providers/AppServiceProvider.php:2");
    expect(out).toContain("- DI type-hints / parameters (1):");
    expect(out).toContain("- test references: 1 hits across 1 files");
    expect(out).toContain("## Unresolved by construction");
  });

  it("uses exported names for TypeScript symbols so basenames do not match unrelated identifiers", () => {
    const cwd = makeRepo();
    const out = runBrief(cwd, "src/lib", "--no-docs", "--no-lsp").stdout;
    expect(out).toContain("## formatDate (src/lib/commands.ts)");
    expect(out).not.toContain("## commands (");
    expect(out).toContain("- imports: 1 hits across 1 files");
    expect(out).toContain(
      "src/pages/Home.tsx:2  const commands = formatDate(new Date());",
    );
  });

  it("marks a file whose symbol came from its basename in the Files section", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "ui"));
    writeFileSync(
      join(cwd, "ui", "Button.tsx"),
      "function Button() {}\nexport { Button as default };\n",
    );
    writeFileSync(join(cwd, "ui", "Dialog.tsx"), "export * from './parts';\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "ui");
    const out = runBrief(cwd, "ui", "--no-docs", "--no-lsp").stdout;
    expect(out).toContain("- ui/Button.tsx (no named exports; basename used)");
    expect(out).toContain("- ui/Dialog.tsx (no named exports; basename used)");
    expect(out).toContain("## Button (ui/Button.tsx)");
    expect(out).toContain("## Dialog (ui/Dialog.tsx)");
  });

  // root ignores file modes, so the chmod cannot make the file unreadable there.
  it("exits 1 with the reason and no stack trace when a source file is unreadable", {
    skip: process.getuid?.() === 0,
  }, () => {
    const cwd = makeRepo();
    const file = join(cwd, "src", "lib", "commands.ts");
    chmodSync(file, 0o000);
    try {
      const r = runBrief(cwd, "src/lib", "--no-docs", "--no-lsp");
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/^brief\.mjs: .*EACCES/);
      expect(r.stderr).not.toContain("    at ");
    } finally {
      chmodSync(file, 0o644);
    }
  });

  it("briefs a target that holds only .mjs files", () => {
    const cwd = makeRepo();
    mkdirSync(join(cwd, "tools"));
    writeFileSync(
      join(cwd, "tools", "render-comments.mjs"),
      "export function renderComments() {}\n",
    );
    const r = runBrief(cwd, "tools", "--no-lsp");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## renderComments (tools/render-comments.mjs)");
    expect(r.stdout).toContain("## Doc sources (context7 version gate)");
  });

  it("keeps the doc-source section without a network call when the target has no third-party imports", () => {
    const cwd = makeRepo();
    const r = spawnSync(process.execPath, [script, "src/lib", "--no-lsp"], {
      cwd,
      encoding: "utf8",
      env: {
        PATH: NO_TOOLS_PATH,
        HOME: cwd,
        INVESTIGATE_BRIEF_CACHE_DIR: join(cwd, ".cache"),
        INVESTIGATE_BRIEF_C7_URL: "http://127.0.0.1:9/search",
      },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("## Third-party surface");
    expect(r.stdout).toContain(
      "## Doc sources (context7 version gate)\n\n- no third-party imports in this target — nothing to gate",
    );
    expect(r.stdout).not.toContain("lookup FAILED");
    expect(r.stdout).toContain(
      "- context7: not needed (no third-party imports)",
    );
  });

  it("reports third-party imports as UNRESOLVED when the target's lockfile is missing", () => {
    const cwd = makeRepo();
    git(cwd, "rm", "-q", "package-lock.json");
    git(cwd, "commit", "-q", "-m", "drop lock");
    const r = spawnSync(process.execPath, [script, "src/lib", "--no-lsp"], {
      cwd,
      encoding: "utf8",
      env: {
        PATH: NO_TOOLS_PATH,
        HOME: cwd,
        INVESTIGATE_BRIEF_CACHE_DIR: join(cwd, ".cache"),
        INVESTIGATE_BRIEF_C7_URL: "http://127.0.0.1:9/search",
      },
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      "- context7: skipped (no package-lock.json read)",
    );
    expect(r.stdout).toContain("## Third-party surface");
    expect(r.stdout).toContain("- UNRESOLVED: no package-lock.json was read");
    expect(r.stdout).not.toContain("nothing to gate");
    expect(r.stdout).not.toContain("not needed (no third-party imports)");
  });

  it("includes the doc-source section header when docs are not skipped but context7 is unreachable", () => {
    const cwd = makeRepo();
    const r = spawnSync(
      process.execPath,
      [script, "app/Services", "--no-lsp"],
      {
        cwd,
        encoding: "utf8",
        env: {
          PATH: NO_TOOLS_PATH,
          HOME: cwd,
          INVESTIGATE_BRIEF_CACHE_DIR: join(cwd, ".cache"),
          INVESTIGATE_BRIEF_C7_URL: "http://127.0.0.1:9/search",
        },
        timeout: 60_000,
      },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("## Doc sources (context7 version gate)");
    expect(r.stdout).toContain("lookup FAILED");
    expect(r.stdout).toContain(
      "- context7: FAILED (all 1 lookups failed, anonymous — no CONTEXT7_API_KEY)",
    );
  });
});

describe("brief.mjs with language servers on PATH", () => {
  it("reports both servers as ran and renders types and callers once per file", () => {
    const cwd = makeRepo();
    writeFileSync(
      join(cwd, "src", "lib", "commands.ts"),
      "export function formatDate(d: Date): string { return d.toISOString(); }\nexport const parseDate = (s: string): Date => new Date(s);\n",
    );
    git(cwd, "commit", "-qam", "two exports");
    const env = { PATH: FAKE_LSP_PATH };
    const ts = runBriefWith(env, cwd, "src/lib", "--no-docs");
    expect(ts.status).toBe(0);
    expect(ts.stdout).toContain("- typescript-language-server: ran");
    expect(ts.stdout).toContain("- phpantom_lsp: not needed (no PHP symbols)");
    expect(ts.stdout.match(/verified callers \(ts-lsp/g)).toHaveLength(1);
    const formatSection = ts.stdout.split("## parseDate")[0] ?? "";
    expect(formatSection).toContain(
      "- verified callers (ts-lsp incomingCalls on commands, 2 shown):",
    );
    const php = runBriefWith(env, cwd, "app/Services", "--no-docs");
    expect(php.stdout).toContain("- phpantom_lsp: ran");
    expect(php.stdout).toContain("- resolved types (phpantom, 2 methods):");
  });

  it("carries the server's initialize error into the FAILED status", () => {
    const cwd = makeRepo();
    const r = runBriefWith(
      { PATH: FAKE_LSP_PATH, FAKE_LSP_FAIL_INIT: "1" },
      cwd,
      "src/lib",
      "--no-docs",
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(
      "- typescript-language-server: FAILED (initialize: Could not find a valid installation; stderr: fake: no TypeScript install found)",
    );
  });

  it("reports FAILED when every per-file request fails after initialize", () => {
    const cwd = makeRepo();
    const r = runBriefWith(
      { PATH: FAKE_LSP_PATH, FAKE_LSP_EXIT_AFTER_INIT: "1" },
      cwd,
      "app/Services",
      "--no-docs",
    );
    expect(r.stdout).toMatch(
      /- phpantom_lsp: FAILED \(1 of 1 files failed: .*server exited/,
    );
  });

  it("sends only the files behind rendered symbols to the server", () => {
    const cwd = makeRepo();
    writeFileSync(join(cwd, "app", "Services", "Zeta.php"), "<?php\n");
    git(cwd, "add", ".");
    git(cwd, "commit", "-qm", "zeta");
    const r = runBriefWith(
      { PATH: FAKE_LSP_PATH, FAKE_LSP_FAIL_URI_MATCH: "Zeta" },
      cwd,
      "app/Services",
      "--no-docs",
      "--max-symbols",
      "1",
    );
    expect(r.stdout).toContain("- phpantom_lsp: ran");
  });
});

describe("renderTools", () => {
  it("renders one line per tool in a fixed order", () => {
    expect(render.renderTools({ git: "ran", gitnexus: "not on PATH" })).toEqual(
      ["## Tools", "", "- git: ran", "- gitnexus: not on PATH", ""],
    );
  });
});

describe("renderDependencies", () => {
  it("names each unread lockfile as UNRESOLVED", () => {
    expect(render.renderDependencies([], ["composer.lock"])).toContain(
      "- UNRESOLVED: no composer.lock was read, so this target's composer imports were not checked. Read the manifest and installed source by hand.",
    );
  });
});

describe("renderDocSources", () => {
  it("renders nothing for --no-docs and a no-imports line without the fetch block", () => {
    expect(render.renderDocSources(null, render.DOCS_SKIPPED)).toEqual([]);
    const lines = render.renderDocSources(null, render.DOCS_NO_IMPORTS);
    expect(lines).toEqual([
      "## Doc sources (context7 version gate)",
      "",
      "- no third-party imports in this target — nothing to gate",
      "",
    ]);
    expect(lines.join("\n")).not.toContain("UNAVAILABLE");
    expect(render.renderDocSources(null, render.DOCS_NO_LOCKFILE)).toEqual([
      "## Doc sources (context7 version gate)",
      "",
      "- not run: no lockfile was read, so third-party imports are UNRESOLVED (see Third-party surface)",
      "",
    ]);
  });
});

describe("renderSymbol", () => {
  it("renders a failed wiring scan and a name collision", () => {
    const lines = render.renderSymbol(
      { name: "Foo", file: "app/Foo.php", kind: "php" },
      {
        dupes: ["app/Other.php:3"],
        typeRows: null,
        tsCallers: null,
        graph: null,
        freshnessOk: false,
        wiring: null,
      },
    );
    expect(lines[0]).toBe("## Foo (app/Foo.php)");
    expect(
      lines.some(
        (l) => l.includes("NAME COLLISION") && l.includes("app/Other.php:3"),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes("wiring scan FAILED"))).toBe(true);
  });

  it("renders no-external-references when every bucket is empty", () => {
    const lines = render.renderSymbol(
      { name: "Foo", file: "app/Foo.php", kind: "php" },
      {
        dupes: [],
        typeRows: null,
        tsCallers: null,
        graph: null,
        freshnessOk: false,
        wiring: {},
      },
    );
    expect(lines.some((l) => l.includes("no external references found"))).toBe(
      true,
    );
  });
});
