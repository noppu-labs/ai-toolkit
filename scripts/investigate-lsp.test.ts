import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { makeGitDirRepo } from "./fixtures/git-dir-target.ts";
import { git } from "./fixtures/investigate-git.ts";
import { FAKE_MARKER_PATH, makeUnsetGitEnv } from "./fixtures/marker-tool.ts";
import {
  commitFiles,
  commitLink,
  commitSubmodule,
  isCaseInsensitiveTmp,
  makeTempDir,
  makeTsRepo,
  writeFiles,
} from "./fixtures/ts-load-repo.ts";

type FrameParser = { push: (chunk: Buffer) => unknown[] };
type LspModule = {
  FrameParser: new () => FrameParser;
  flattenSymbols: (syms: unknown[]) => Array<{ name: string }>;
};
type Outcome<T> =
  | { results: Map<string, T>; failures: string[]; total: number }
  | { error: string }
  | { skipped: string };
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
  if ("skipped" in outcome) {
    throw new Error(`unexpected skip ${outcome.skipped}`);
  }
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

const TRUST_VAR = "INVESTIGATE_BRIEF_TRUST_REPO_TS";
const OPT_IN = `set ${TRUST_VAR}=1 to run it`;
const CASE_INSENSITIVE: boolean = isCaseInsensitiveTmp();

// The developer's own trust setting must not leak into these runs.
function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env[TRUST_VAR];

  return env;
}

type TsRun = {
  out: Awaited<ReturnType<TsModule["tsLspCallers"]>>;
  started: boolean;
};

async function runTsPass(
  repoRoot: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<TsRun> {
  const log = join(makeTempDir("investigate-start-"), "log");
  const out = await ts.tsLspCallers(
    {
      repoRoot,
      repoName: "x",
      env: { ...baseEnv(), FAKE_LSP_START_LOG: log, ...extraEnv },
    },
    [join(repoRoot, "src", "formatDate.ts")],
    fake,
  );

  return { out, started: existsSync(log) };
}

function skippedFor(location: string, where = "the repository"): unknown {
  return {
    skipped: `${where} tracks files in ${location}, where the server loads code from; ${OPT_IN}`,
  };
}

describe("tsLspCallers in a repository that tracks code the server loads", () => {
  it.each([
    ["node_modules/typescript/lib/tsserver.js", "node_modules"],
    ["node_modules/helper/index.js", "node_modules"],
    [".yarn/sdks/typescript/lib/tsserver.js", ".yarn/sdks"],
    [".vscode/pnpify/typescript/lib/tsserver.js", ".vscode/pnpify"],
    [".pnp.cjs", ".pnp.cjs"],
    [".pnp.js", ".pnp.js"],
    [".pnp.loader.mjs", ".pnp.loader.mjs"],
    [".pnp.data.json", ".pnp.data.json"],
  ])("does not start the server when %s is tracked", async (rel, location) => {
    const root = makeTsRepo();
    commitFiles(root, { [rel]: "x\n" });
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor(location));
  });

  it.each([
    [".yarn/cache/typescript.zip", ".yarn/cache", ".pnp.cjs"],
    [".yarn/cache/typescript.zip", ".yarn/cache", ".pnp.js"],
    [".yarn/unplugged/typescript/package.json", ".yarn/unplugged", ".pnp.cjs"],
  ])(
    "does not start the server when %s is tracked beside a Plug'n'Play file (%s, %s)",
    async (rel, location, pnp) => {
      const root = makeTsRepo();
      commitFiles(root, { [rel]: "x\n" });
      writeFiles(root, { [pnp]: "\n" });
      const run = await runTsPass(root);
      expect(run.started).toBe(false);
      expect(run.out).toEqual(skippedFor(location));
    },
  );

  it.each([
    ".yarn/cache/typescript.zip",
    ".yarn/unplugged/typescript/package.json",
  ])(
    "starts the server when %s is tracked and no Plug'n'Play file loads from it",
    async (rel) => {
      const root = makeTsRepo();
      commitFiles(root, { [rel]: "x\n" });
      const run = await runTsPass(root);
      expect(run.started).toBe(true);
    },
  );

  it("does not start it when only a package beside an installed TypeScript is tracked", async () => {
    const root = makeTsRepo();
    writeFiles(root, { "node_modules/typescript/package.json": "{}\n" });
    commitFiles(root, { "node_modules/helper/package.json": "{}\n" });
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor("node_modules"));
  });

  it.each([
    [".yarn", "tools/y", "tools/y/sdks/typescript/package.json", ".yarn/sdks"],
    [
      ".vscode",
      "tools/vs",
      "tools/vs/pnpify/typescript/package.json",
      ".vscode/pnpify",
    ],
    [
      "node_modules",
      "tools/nm",
      "tools/nm/typescript/package.json",
      "node_modules",
    ],
    [
      "node_modules/typescript",
      "../tools/ts",
      "tools/ts/package.json",
      "node_modules",
    ],
    [
      ".yarn/sdks",
      "../tools/sdks",
      "tools/sdks/typescript/package.json",
      ".yarn/sdks",
    ],
  ])(
    "does not start it when %s is a tracked link to %s",
    async (rel, target, file, location) => {
      const root = makeTsRepo();
      commitFiles(root, { [file]: "{}\n" });
      commitLink(root, rel, target);
      const run = await runTsPass(root);
      expect(run.started).toBe(false);
      expect(run.out).toEqual(skippedFor(location));
    },
  );

  it("does not start it when a tracked link points out of the repository", async () => {
    const outside = makeTempDir("investigate-outside-");
    writeFiles(outside, { "typescript/package.json": "{}\n" });
    const root = makeTsRepo();
    commitLink(root, "node_modules", outside);
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor("node_modules"));
  });

  it("does not start it when an untracked link leads to tracked files", async () => {
    const root = makeTsRepo();
    commitFiles(root, { "tools/nm/typescript/package.json": "{}\n" });
    symlinkSync("tools/nm", join(root, "node_modules"));
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor("node_modules"));
  });

  it("does not start it when a submodule holds a lookup folder", async () => {
    const sub = makeTempDir("investigate-sub-");
    git(sub, "init", "-q", "-b", "main");
    commitFiles(sub, { "sdks/typescript/package.json": "{}\n" });
    const root = makeTsRepo();
    commitSubmodule(root, ".yarn", sub);
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor(".yarn/sdks"));
  });

  // Skipped on a case-sensitive filesystem, where the server would not find it.
  it("does not start it when a lookup folder is tracked in another letter case", {
    skip: !CASE_INSENSITIVE,
  }, async () => {
    const root = makeTsRepo();
    commitFiles(root, { ".YARN/sdks/typescript/package.json": "{}\n" });
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor(".yarn/sdks"));
  });

  // Skipped on a case-sensitive filesystem, where the server would not find it.
  it("does not start it when a tracked link in another letter case points out of the repository", {
    skip: !CASE_INSENSITIVE,
  }, async () => {
    const outside = makeTempDir("investigate-outside-");
    writeFiles(outside, { "sdks/typescript/package.json": "{}\n" });
    const root = makeTsRepo();
    commitLink(root, ".YARN", outside);
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor(".yarn/sdks"));
  });

  it("still finds a tracked file when the environment turns pathspec magic off", async () => {
    const root = makeTsRepo();
    commitFiles(root, { ".yarn/sdks/typescript/package.json": "{}\n" });
    const run = await runTsPass(root, { GIT_LITERAL_PATHSPECS: "1" });
    expect(run.started).toBe(false);
    expect(run.out).toEqual(skippedFor(".yarn/sdks"));
  });

  it("starts it when node_modules is installed and ignored", async () => {
    const root = makeTsRepo();
    writeFiles(root, {
      "node_modules/typescript/package.json": "{}\n",
      ".yarn/releases/yarn.cjs": "x\n",
      ".vscode/settings.json": "{}\n",
    });
    git(root, "add", "-f", ".yarn/releases", ".vscode/settings.json");
    git(root, "commit", "-qm", "editor settings and the yarn release");
    const run = await runTsPass(root);
    expect(run.started).toBe(true);
    expect(resultsOf(run.out).size).toBe(1);
  });

  it(`starts it when ${TRUST_VAR} is 1`, async () => {
    const root = makeTsRepo();
    commitFiles(root, { ".yarn/sdks/typescript/package.json": "{}\n" });
    const run = await runTsPass(root, { [TRUST_VAR]: "1" });
    expect(run.started).toBe(true);
    expect(resultsOf(run.out).size).toBe(1);
  });

  it.each(["true", "yes", "0", "", " 1"])(
    `does not start it when ${TRUST_VAR} is %j`,
    async (value) => {
      const root = makeTsRepo();
      commitFiles(root, { ".yarn/sdks/typescript/package.json": "{}\n" });
      const run = await runTsPass(root, { [TRUST_VAR]: value });
      expect(run.started).toBe(false);
    },
  );

  it("does not start it when the superproject tracks a lookup folder", async () => {
    const inner = makeTsRepo();
    const outer = makeTempDir("investigate-super-");
    git(outer, "init", "-q", "-b", "main");
    commitFiles(outer, { "node_modules/typescript/package.json": "{}\n" });
    commitSubmodule(outer, "mod", inner);
    const run = await runTsPass(join(outer, "mod"));
    expect(run.started).toBe(false);
    expect(run.out).toEqual(
      skippedFor("node_modules", "a working tree above the repository"),
    );
  });

  it("does not start it when an enclosing working tree tracks a lookup folder", async () => {
    const outer = makeTempDir("investigate-outer-");
    git(outer, "init", "-q", "-b", "main");
    writeFiles(outer, { ".gitignore": "mod/\n" });
    commitFiles(outer, {
      ".gitignore": "mod/\n",
      "node_modules/typescript/package.json": "{}\n",
    });
    mkdirSync(join(outer, "mod"));
    const root = makeTsRepo(join(outer, "mod"));
    const run = await runTsPass(root);
    expect(run.started).toBe(false);
    expect(run.out).toEqual(
      skippedFor("node_modules", "a working tree above the repository"),
    );
  });

  it("starts it under a parent folder that no working tree holds", async () => {
    const outer = makeTempDir("investigate-plain-");
    writeFiles(outer, { "node_modules/typescript/package.json": "{}\n" });
    mkdirSync(join(outer, "mod"));
    const root = makeTsRepo(join(outer, "mod"));
    const run = await runTsPass(root);
    expect(run.started).toBe(true);
  });

  it("does not start it, nor obey its config, under a parent shaped like a git directory", async () => {
    const planted = makeGitDirRepo();
    writeFiles(planted.sub, { "node_modules/typescript/package.json": "{}\n" });
    mkdirSync(join(planted.sub, "inner"));
    const root = makeTsRepo(join(planted.sub, "inner"));
    const run = await runTsPass(root, {
      ...makeUnsetGitEnv(),
      FAKE_MARKER_FILE: planted.marker,
    });
    expect(run.started).toBe(false);
    expect(run.out).toEqual({
      skipped: expect.stringMatching(
        /^could not tell .*inside a git directory/,
      ),
    });
    expect(existsSync(planted.marker)).toBe(false);
  });

  it("does not start it, nor obey its config, under a tracked parent shaped like a git directory, with git's own refusal", async () => {
    const planted = makeGitDirRepo();
    commitFiles(planted.cwd, {
      "pkg/node_modules/typescript/package.json": "{}\n",
    });
    mkdirSync(join(planted.sub, "inner"));
    const root = makeTsRepo(join(planted.sub, "inner"));
    const run = await runTsPass(root, {
      PATH: FAKE_MARKER_PATH,
      FAKE_MARKER_FILE: planted.marker,
    });
    expect(run.started).toBe(false);
    expect(run.out).toEqual({
      skipped: expect.stringMatching(/^could not tell .*would not name/),
    });
    expect(existsSync(planted.marker)).toBe(false);
  });

  it("does not start it when git cannot list the tracked files", async () => {
    const root = makeTsRepo();
    writeFiles(root, { "node_modules/typescript/package.json": "{}\n" });
    const run = await runTsPass(root, {
      PATH: makeTempDir("investigate-empty-path-"),
    });
    expect(run.started).toBe(false);
    expect(run.out).toEqual({
      skipped: expect.stringMatching(/^could not tell .*git ls-files failed/),
    });
  });
});

// A server install with its own TypeScript beside it, reached through a link
// on PATH as npm leaves a global install.
function makeServerInstall(tsVersion: string): string {
  const install = makeTempDir("investigate-server-");
  writeFiles(install, {
    "lib/cli.mjs": readFileSync(fake, "utf8"),
    "node_modules/typescript/package.json": JSON.stringify({
      name: "typescript",
      version: tsVersion,
      main: "lib/typescript.js",
    }),
    "node_modules/typescript/lib/typescript.js": "\n",
    "node_modules/typescript/lib/tsserver.js": "\n",
  });
  chmodSync(join(install, "lib", "cli.mjs"), 0o755);
  mkdirSync(join(install, "bin"));
  symlinkSync(
    join(install, "lib", "cli.mjs"),
    join(install, "bin", "typescript-language-server"),
  );

  return join(install, "bin", "typescript-language-server");
}

function writeWorkspaceTs(root: string, version: string): void {
  writeFiles(root, {
    "node_modules/typescript/package.json": JSON.stringify({ version }),
    "node_modules/typescript/lib/tsserver.js": "\n",
  });
}

function oldTsSkip(version: string, where: string): unknown {
  return {
    skipped: `the TypeScript the server would run (${version}, ${where}) loads a plugin from any path a tsconfig names; ${OPT_IN}`,
  };
}

describe("tsLspCallers and the TypeScript the server would run", () => {
  it.each(["2.9.2", "3.8.3", "3.9.7", "4.0.5", "4.1.3", "4.2.0-beta", "next"])(
    "does not start the server for an installed TypeScript %s",
    async (version) => {
      const root = makeTsRepo();
      writeWorkspaceTs(root, version);
      const run = await runTsPass(root);
      expect(run.started).toBe(false);
      expect(run.out).toEqual(oldTsSkip(version, "in or above the repository"));
    },
  );

  it.each([
    "3.9.8",
    "4.0.6",
    "4.1.4",
    "4.2.1-rc",
    "4.3.0-beta",
    "5.9.3",
    "6.0.3",
    "5.9.3-sdk",
  ])("starts it for an installed TypeScript %s", async (version) => {
    const root = makeTsRepo();
    writeWorkspaceTs(root, version);
    const run = await runTsPass(root);
    expect(run.started).toBe(true);
  });

  it("reads the TypeScript in a folder above the repository", async () => {
    const outer = makeTempDir("investigate-old-above-");
    writeWorkspaceTs(outer, "3.8.3");
    mkdirSync(join(outer, "mod"));
    const run = await runTsPass(makeTsRepo(join(outer, "mod")));
    expect(run.started).toBe(false);
    expect(run.out).toEqual(oldTsSkip("3.8.3", "in or above the repository"));
  });

  it("reads the TypeScript beside the server when the repository has none", async () => {
    const root = makeTsRepo();
    const server = makeServerInstall("4.0.5");
    const log = join(makeTempDir("investigate-start-"), "log");
    const ctx = {
      repoRoot: root,
      repoName: "x",
      env: { ...baseEnv(), FAKE_LSP_START_LOG: log },
    };
    const file = join(root, "src", "formatDate.ts");
    expect(await ts.tsLspCallers(ctx, [file], server)).toEqual(
      oldTsSkip("4.0.5", "beside the server"),
    );
    expect(existsSync(log)).toBe(false);

    const trusted = await ts.tsLspCallers(
      { ...ctx, env: { ...ctx.env, [TRUST_VAR]: "1" } },
      [file],
      server,
    );
    expect(resultsOf(trusted).size).toBe(1);
    expect(existsSync(log)).toBe(true);
  });

  it("finds the server on PATH and starts it beside a TypeScript 4.0.6", async () => {
    const root = makeTsRepo();
    const server = makeServerInstall("4.0.6");
    const out = await ts.tsLspCallers(
      {
        repoRoot: root,
        repoName: "x",
        env: {
          ...baseEnv(),
          PATH: `${join(server, "..")}:${process.env.PATH}`,
        },
      },
      [join(root, "src", "formatDate.ts")],
      "typescript-language-server",
    );
    expect(resultsOf(out).size).toBe(1);
  });

  it("takes the repository's TypeScript over the one beside the server", async () => {
    const root = makeTsRepo();
    writeWorkspaceTs(root, "5.9.3");
    const run = await ts.tsLspCallers(
      { repoRoot: root, repoName: "x", env: baseEnv() },
      [join(root, "src", "formatDate.ts")],
      makeServerInstall("3.8.3"),
    );
    expect(resultsOf(run).size).toBe(1);
  });

  it("falls back to the server's TypeScript when the repository's has no version", async () => {
    const root = makeTsRepo();
    writeFiles(root, {
      "node_modules/typescript/package.json": "{}\n",
      "node_modules/typescript/lib/tsserver.js": "\n",
    });
    const run = await ts.tsLspCallers(
      { repoRoot: root, repoName: "x", env: baseEnv() },
      [join(root, "src", "formatDate.ts")],
      makeServerInstall("3.8.3"),
    );
    expect(run).toEqual(oldTsSkip("3.8.3", "beside the server"));
  });
});

describe("initializationOptions", () => {
  it("turns off type acquisition for the TypeScript server and sends nothing to phpantom", async () => {
    const root = makeTsRepo();
    writeFiles(root, { "app/Invoice.php": "<?php\nclass Invoice {}\n" });
    const log = join(makeTempDir("investigate-init-"), "log");
    const ctx = {
      repoRoot: root,
      repoName: "x",
      env: { ...baseEnv(), FAKE_LSP_INIT_LOG: log },
    };
    await ts.tsLspCallers(ctx, [join(root, "src", "formatDate.ts")], fake);
    await php.phpantomTypes(ctx, [join(root, "app", "Invoice.php")], fake);
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual([
      '{"disableAutomaticTypingAcquisition":true}',
      "null",
    ]);
  });
});
