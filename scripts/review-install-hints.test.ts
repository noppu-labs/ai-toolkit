import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const reviewDir = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "pr-review",
);
const script = join(reviewDir, "scripts", "install-hints.mjs");
const schemaPath = join(reviewDir, "references", "install-hints.schema.json");

type RunResult = { status: number | null; stdout: string; stderr: string };
type Files = Record<string, string>;
type Json = Record<string, unknown>;
type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: unknown[];
  pattern?: string;
};

const realGit = spawnSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).stdout.trim();

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commitFiles(cwd: string, files: Files): string {
  for (const [path, content] of Object.entries(files)) {
    write(cwd, path, content);
  }

  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "change");

  return git(cwd, "rev-parse", "HEAD");
}

function makeRepo(files: Files = {}): { cwd: string; sha: string } {
  const cwd = mkdtempSync(join(tmpdir(), "review-install-hints-"));

  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");

  return { cwd, sha: commitFiles(cwd, { "notes.txt": "x\n", ...files }) };
}

function makeBin(executables: string[] = []): string {
  const bin = mkdtempSync(join(tmpdir(), "review-install-hints-bin-"));

  symlinkSync(realGit, join(bin, "git"));

  for (const name of executables) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }

  return bin;
}

function run(cwd: string, sha?: string, bin: string = makeBin()): RunResult {
  const args = sha === undefined ? [script] : [script, sha];
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: { PATH: bin },
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function hints(files: Files, bin?: string): Json {
  const { cwd, sha } = makeRepo(files);
  const result = run(cwd, sha, bin);

  if (result.status !== 0) {
    throw new Error(`install-hints failed: ${result.stderr}`);
  }

  return JSON.parse(result.stdout) as Json;
}

function matchesType(type: string, value: unknown): boolean {
  if (type === "null") {
    return value === null;
  }

  if (type === "array") {
    return Array.isArray(value);
  }

  if (type === "object") {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  return typeof value === type;
}

function validateObject(schema: Schema, value: Json, path: string): string[] {
  const errors: string[] = [];
  const properties = schema.properties ?? {};

  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      errors.push(`${path}: missing ${key}`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    const childSchema = properties[key];

    if (childSchema !== undefined) {
      errors.push(...validate(childSchema, child, `${path}.${key}`));
    } else if (schema.additionalProperties === false) {
      errors.push(`${path}: unexpected ${key}`);
    }
  }

  return errors;
}

function validate(schema: Schema, value: unknown, path = "$"): string[] {
  const types = [schema.type ?? []].flat();

  if (types.length > 0 && !types.some((type) => matchesType(type, value))) {
    return [`${path}: expected ${types.join("|")}`];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path}: not in enum`];
  }

  if (schema.pattern && !new RegExp(schema.pattern).test(String(value))) {
    return [`${path}: does not match pattern`];
  }

  if (Array.isArray(value) && schema.items) {
    const items = schema.items;

    return value.flatMap((item, i) => validate(items, item, `${path}[${i}]`));
  }

  if (matchesType("object", value)) {
    return validateObject(schema, value as Json, path);
  }

  return [];
}

const lockfileCases: [string, Files, string, string][] = [
  ["composer.lock", {}, "composer", "composer install"],
  ["package-lock.json", {}, "npm", "npm ci"],
  ["pnpm-lock.yaml", {}, "pnpm", "pnpm install --frozen-lockfile"],
  ["yarn.lock", {}, "yarn", "yarn install --frozen-lockfile"],
  [
    "yarn.lock",
    { ".yarnrc.yml": "nodeLinker: node-modules\n" },
    "yarn",
    "yarn install --immutable",
  ],
  ["bun.lock", {}, "bun", "bun install --frozen-lockfile"],
  ["bun.lockb", {}, "bun", "bun install --frozen-lockfile"],
  ["uv.lock", {}, "uv", "uv sync --locked"],
  ["poetry.lock", {}, "poetry", "poetry install"],
  ["Gemfile.lock", {}, "bundler", "bundle install"],
  ["go.sum", {}, "go", "go mod download"],
];

describe("install-hints.mjs", () => {
  it("prints every key with empty values for a repo with nothing to install", () => {
    const { cwd, sha } = makeRepo();
    const result = run(cwd, sha);

    expect(result.status).toBe(0);
    expect(result.stdout.endsWith("}\n")).toBe(true);
    expect(JSON.parse(result.stdout)).toEqual({
      headSha: sha,
      lockfiles: [],
      entryPoints: [],
      installHooks: [],
      runtimes: [],
      tools: [],
      envExample: null,
    });
  });

  it("reads the tree at the SHA, not the working tree", () => {
    const { cwd, sha } = makeRepo({ "composer.lock": "{}\n" });

    rmSync(join(cwd, "composer.lock"));
    commitFiles(cwd, { "package-lock.json": "{}\n" });

    const result = run(cwd, sha);

    expect(JSON.parse(result.stdout).lockfiles).toEqual([
      {
        path: "composer.lock",
        manager: "composer",
        likelyCommand: "composer install",
      },
    ]);
  });

  it.each(lockfileCases)(
    "maps %s to its manager and command",
    (file, extra, manager, likelyCommand) => {
      const result = hints({ [file]: "x\n", ...extra });

      expect(result.lockfiles).toEqual([
        { path: file, manager, likelyCommand },
      ]);
    },
  );

  it("lists nested lockfiles but not vendored ones", () => {
    const result = hints({
      "frontend/package-lock.json": "{}\n",
      "vendor/acme/x/composer.lock": "{}\n",
      "node_modules/y/package-lock.json": "{}\n",
    });

    expect(result.lockfiles).toEqual([
      {
        path: "frontend/package-lock.json",
        manager: "npm",
        likelyCommand: "npm ci",
      },
    ]);
  });

  it("lists make targets but not assignments or special targets", () => {
    const result = hints({
      Makefile: [
        "INSTALL := x",
        ".PHONY: install setup",
        "install:",
        "\t@true",
        "install-deps: ; @true",
        "build:",
        "setup::",
        "",
      ].join("\n"),
    });

    expect(result.entryPoints).toEqual([
      {
        path: "Makefile",
        kind: "make",
        names: ["install", "install-deps", "setup"],
      },
    ]);
    expect(result.tools).toEqual([{ name: "make", onPath: false }]);
  });

  it("lists just recipes and Taskfile tasks with install-like names", () => {
    const result = hints({
      justfile: "version := '1'\nsetup arg:\n  echo\nbuild:\n  echo\n",
      "Taskfile.yml":
        "version: '3'\ntasks:\n  install:\n    cmds: []\n  build:\n    cmds: []\nother:\n  setup:\n",
    });

    expect(result.entryPoints).toEqual([
      { path: "Taskfile.yml", kind: "task", names: ["install"] },
      { path: "justfile", kind: "just", names: ["setup"] },
    ]);
  });

  it("lists composer and npm scripts with install-like names, hooks separately", () => {
    const result = hints({
      "package.json": JSON.stringify({
        scripts: { setup: "node s.js", build: "x", postinstall: "node x.js" },
      }),
      "composer.json": JSON.stringify({
        scripts: { "post-install-cmd": ["@php a", "@php b"] },
      }),
    });

    expect(result.entryPoints).toEqual([
      { path: "package.json", kind: "npm-script", names: ["setup"] },
    ]);
    expect(result.installHooks).toEqual([
      {
        path: "composer.json",
        name: "post-install-cmd",
        command: "@php a && @php b",
      },
      { path: "package.json", name: "postinstall", command: "node x.js" },
    ]);
  });

  it("reads manifests in lockfile directories", () => {
    const result = hints({
      "web/package-lock.json": "{}\n",
      "web/package.json": JSON.stringify({ scripts: { prepare: "husky" } }),
    });

    expect(result.installHooks).toEqual([
      { path: "web/package.json", name: "prepare", command: "husky" },
    ]);
  });

  it("reports a workspace member's install hook but not a vendored one", () => {
    const result = hints({
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "package-lock.json": "{}\n",
      "packages/a/package.json": JSON.stringify({
        scripts: { postinstall: "node a.js", preprepare: "x", build: "y" },
      }),
      "packages/b/composer.json": JSON.stringify({
        scripts: { "pre-autoload-dump": "@php b" },
      }),
      "vendor/pkg/composer.json": JSON.stringify({
        scripts: { "post-install-cmd": "evil" },
      }),
      "packages/a/node_modules/x/package.json": JSON.stringify({
        scripts: { postinstall: "evil" },
      }),
    });

    expect(result.installHooks).toEqual([
      {
        path: "packages/a/package.json",
        name: "postinstall",
        command: "node a.js",
      },
      { path: "packages/a/package.json", name: "preprepare", command: "x" },
      {
        path: "packages/b/composer.json",
        name: "pre-autoload-dump",
        command: "@php b",
      },
    ]);
    expect(result.entryPoints).toEqual([]);
  });

  it("recognises postprepare as an npm hook", () => {
    const result = hints({
      "package.json": JSON.stringify({ scripts: { postprepare: "p" } }),
    });

    expect(result.installHooks).toEqual([
      { path: "package.json", name: "postprepare", command: "p" },
    ]);
  });

  it("lists init headings in docs", () => {
    const result = hints({ "README.md": "# T\n## Init the project\n" });

    expect(result.entryPoints).toEqual([
      { path: "README.md", kind: "docs-section", names: ["Init the project"] },
    ]);
  });

  it("lists docs headings about installing", () => {
    const result = hints({
      "README.md":
        "# T\n## Installation\n### Getting started\n## Usage\n```\n# setup comment\n```\n",
    });

    expect(result.entryPoints).toEqual([
      {
        path: "README.md",
        kind: "docs-section",
        names: ["Getting started", "Installation"],
      },
    ]);
  });

  it("lists setup script files", () => {
    const result = hints({ "bin/setup": "#!/bin/sh\n" });

    expect(result.entryPoints).toEqual([
      { path: "bin/setup", kind: "script-file", names: [] },
    ]);
  });

  it("reads runtime pins", () => {
    const result = hints({
      ".nvmrc": "22\n",
      ".tool-versions": "php 8.4.1\nnodejs 22.1.0\n",
      "composer.json": JSON.stringify({ require: { php: "^8.4" } }),
    });

    expect(result.runtimes).toEqual([
      { path: ".nvmrc", tool: "node", version: "22" },
      { path: ".tool-versions", tool: "nodejs", version: "22.1.0" },
      { path: ".tool-versions", tool: "php", version: "8.4.1" },
      { path: "composer.json", tool: "php", version: "^8.4" },
    ]);
  });

  it("reads engines.node from package.json", () => {
    const result = hints({
      "package.json": JSON.stringify({ engines: { node: ">=22" } }),
    });

    expect(result.runtimes).toEqual([
      { path: "package.json", tool: "node", version: ">=22" },
    ]);
  });

  it("prefers .env.example over .env.dist", () => {
    expect(hints({ ".env.dist": "A=1\n" }).envExample).toBe(".env.dist");
    expect(
      hints({ ".env.dist": "A=1\n", ".env.example": "A=1\n" }).envExample,
    ).toBe(".env.example");
  });

  it("reports which implied tools are on PATH", () => {
    const result = hints(
      { "composer.lock": "{}\n", "pnpm-lock.yaml": "x\n" },
      makeBin(["composer"]),
    );

    expect(result.tools).toEqual([
      { name: "composer", onPath: true },
      { name: "pnpm", onPath: false },
    ]);
  });

  it("skips a manifest that is not valid JSON", () => {
    const result = hints({ "package.json": "{", "composer.lock": "{}\n" });

    expect(result.lockfiles).toHaveLength(1);
    expect(result.entryPoints).toEqual([]);
    expect(result.installHooks).toEqual([]);
  });

  it("exits 1 with a message for a SHA git cannot read", () => {
    const { cwd } = makeRepo();
    const result = run(cwd, "0".repeat(40));

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("cannot read");
  });

  it("rejects an option-looking argument and a missing argument", () => {
    const { cwd } = makeRepo();
    const option = run(cwd, "--output=/tmp/x");
    const missing = run(cwd);

    expect(option.status).toBe(1);
    expect(option.stdout).toBe("");
    expect(option.stderr).toContain("cannot read");
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("usage");
  });

  it("matches the JSON Schema for any repo", () => {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Schema;
    const fixtures: Files[] = [
      {},
      { "composer.lock": "{}\n", "yarn.lock": "x\n", ".yarnrc.yml": "a: b\n" },
      {
        Makefile: "install:\n\t@true\n",
        "bin/setup": "#!/bin/sh\n",
        ".nvmrc": "22\n",
      },
      {
        "package.json": JSON.stringify({
          scripts: { setup: "x", postinstall: "y" },
        }),
        "README.md": "## Setup\n",
        ".env.example": "A=1\n",
      },
    ];

    for (const files of fixtures) {
      const output = hints(files);

      expect(validate(schema, output)).toEqual([]);
      expect(schema.required).toEqual(Object.keys(output));
    }

    expect(validate(schema, { headSha: "nope" })).not.toEqual([]);
  });
});
