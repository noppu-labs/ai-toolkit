import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { makeSandbox, realGit } from "./review-test-git.ts";

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

const SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "pattern",
]);
const SCHEMA_ANNOTATIONS = new Set(["$schema", "title", "description"]);

const sandbox = makeSandbox("review-install-hints-");

afterAll(() => {
  sandbox.dispose();
});

function git(cwd: string, ...args: string[]): string {
  return sandbox.git(cwd, ...args);
}

function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

function commitFiles(cwd: string, files: Files, links: Files = {}): string {
  for (const [path, content] of Object.entries(files)) {
    write(cwd, path, content);
  }

  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    symlinkSync(target, join(cwd, path));
  }

  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "change");

  return git(cwd, "rev-parse", "HEAD");
}

function makeRepo(
  files: Files = {},
  links: Files = {},
): { cwd: string; sha: string } {
  const cwd = sandbox.makeDir("repo");

  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.com");
  git(cwd, "config", "user.name", "t");

  return {
    cwd,
    sha: commitFiles(cwd, { "notes.txt": "x\n", ...files }, links),
  };
}

function makeBin(executables: string[] = []): string {
  const bin = sandbox.makeDir("bin");

  symlinkSync(realGit, join(bin, "git"));

  for (const name of executables) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }

  return bin;
}

function run(cwd: string, sha?: string, bin: string = makeBin()): RunResult {
  const args = sha === undefined ? [script] : [script, sha];
  sandbox.assertInside(cwd);

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

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOutput(stdout: string): Json {
  const value: unknown = JSON.parse(stdout);

  if (!isJson(value)) {
    throw new Error("install-hints did not print an object");
  }

  return value;
}

function hintsFor(cwd: string, sha: string, bin?: string): Json {
  const result = run(cwd, sha, bin);

  if (result.status !== 0) {
    throw new Error(`install-hints failed: ${result.stderr}`);
  }

  return parseOutput(result.stdout);
}

function hints(files: Files, bin?: string, links: Files = {}): Json {
  const { cwd, sha } = makeRepo(files, links);

  return hintsFor(cwd, sha, bin);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function parseKeywords(value: Json): Schema {
  const schema: Schema = {};
  const { type, required, additionalProperties } = value;

  if (typeof type === "string" || isStringArray(type)) {
    schema.type = type;
  }

  if (isStringArray(required)) {
    schema.required = required;
  }

  if (typeof additionalProperties === "boolean") {
    schema.additionalProperties = additionalProperties;
  }

  if (Array.isArray(value.enum)) {
    schema.enum = value.enum;
  }

  if (typeof value.pattern === "string") {
    schema.pattern = value.pattern;
  }

  return schema;
}

function parseSchema(value: unknown, path = "$"): Schema {
  if (!isJson(value)) {
    throw new Error(`${path}: a schema must be an object`);
  }

  for (const key of Object.keys(value)) {
    if (!SCHEMA_KEYWORDS.has(key) && !SCHEMA_ANNOTATIONS.has(key)) {
      throw new Error(`${path}: the validator does not model ${key}`);
    }
  }

  const schema = parseKeywords(value);

  if (isJson(value.properties)) {
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, child]) => [
        key,
        parseSchema(child, `${path}.${key}`),
      ]),
    );
  }

  if (value.items !== undefined) {
    schema.items = parseSchema(value.items, `${path}[]`);
  }

  return schema;
}

function readSchema(): Schema {
  const value: unknown = JSON.parse(readFileSync(schemaPath, "utf8"));

  return parseSchema(value);
}

function schemaEnum(...path: string[]): unknown[] {
  let schema: Schema | undefined = readSchema();

  for (const key of path) {
    schema = key === "[]" ? schema?.items : schema?.properties?.[key];
  }

  return schema?.enum ?? [];
}

function matchesType(type: string, value: unknown): boolean {
  if (type === "null") {
    return value === null;
  }

  if (type === "array") {
    return Array.isArray(value);
  }

  if (type === "object") {
    return isJson(value);
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

  if (isJson(value)) {
    return validateObject(schema, value, path);
  }

  return [];
}

const lockfileCases: [string, Files, string, string, string][] = [
  ["composer.lock", {}, "composer", "composer install", "composer"],
  ["package-lock.json", {}, "npm", "npm ci", "npm"],
  ["pnpm-lock.yaml", {}, "pnpm", "pnpm install --frozen-lockfile", "pnpm"],
  ["yarn.lock", {}, "yarn", "yarn install --frozen-lockfile", "yarn"],
  [
    "yarn.lock",
    { ".yarnrc.yml": "nodeLinker: node-modules\n" },
    "yarn",
    "yarn install --immutable",
    "yarn",
  ],
  ["bun.lock", {}, "bun", "bun install --frozen-lockfile", "bun"],
  ["bun.lockb", {}, "bun", "bun install --frozen-lockfile", "bun"],
  ["uv.lock", {}, "uv", "uv sync --locked", "uv"],
  ["poetry.lock", {}, "poetry", "poetry install", "poetry"],
  ["Gemfile.lock", {}, "bundler", "bundle install", "bundle"],
  ["go.sum", {}, "go", "go mod download", "go"],
];

const npmHooks = [
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
  "pnpm:devPreinstall",
];
const composerHooks = [
  "pre-install-cmd",
  "post-install-cmd",
  "pre-autoload-dump",
  "post-autoload-dump",
  "init",
  "pre-command-run",
  "pre-file-download",
  "pre-operations-exec",
  "pre-package-install",
  "post-package-install",
];
const pinCases: [string, string][] = [
  [".nvmrc", "node"],
  [".node-version", "node"],
  [".python-version", "python"],
];
const scriptFiles = [
  "bin/setup",
  "script/setup",
  "bin/bootstrap",
  "script/bootstrap",
];
const docsFiles = ["README.md", "CONTRIBUTING.md", "CLAUDE.md", "AGENTS.md"];
const entryFileCases: [string, string, string, string][] = [
  ["Makefile", "make", "install:\n\t@true\n", "install"],
  ["makefile", "make", "install:\n\t@true\n", "install"],
  ["GNUmakefile", "make", "install:\n\t@true\n", "install"],
  ["justfile", "just", "install:\n  echo\n", "install"],
  ["Justfile", "just", "install:\n  echo\n", "install"],
  ["Taskfile.yml", "task", "tasks:\n  install:\n    cmds: []\n", "install"],
  ["Taskfile.yaml", "task", "tasks:\n  install:\n    cmds: []\n", "install"],
];
const hugeLine = 160_000;
const unsafeDirs = [
  "x$(touch PWNED)",
  'a"b',
  "-dash",
  "a/-b",
  "a\nb",
  "caf\u00e9",
  "a;b",
  "a`b",
  "a:(top)",
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
      skipped: [],
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
    const schema = readSchema();
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
      { "package.json": "{", Makefile: "install:\n" },
      ...lockfileCases.map(([file, extra]) => ({ [file]: "x\n", ...extra })),
    ];

    for (const files of fixtures) {
      const output = hints(files);

      expect(validate(schema, output)).toEqual([]);
      expect(schema.required).toEqual(Object.keys(output));
    }

    expect(validate(schema, { headSha: "nope" })).not.toEqual([]);
  });

  it("rejects schema keywords the test validator does not model", () => {
    expect(() => parseSchema({ type: "object", oneOf: [] })).toThrow("oneOf");
  });

  describe("run from a subdirectory", () => {
    it("prints the same hints as from the root and does not crash on a pin file", () => {
      const { cwd, sha } = makeRepo({
        "package.json": JSON.stringify({ scripts: { postinstall: "root" } }),
        "package-lock.json": "{}\n",
        "web/package.json": JSON.stringify({ scripts: { prepare: "web" } }),
        "web/package-lock.json": "{}\n",
        "web/.nvmrc": "20\n",
        "docs/.python-version": "3.13\n",
      });
      const fromRoot = hintsFor(cwd, sha);
      const fromWeb = hintsFor(join(cwd, "web"), sha);
      const fromDocs = hintsFor(join(cwd, "docs"), sha);

      expect(fromWeb).toEqual(fromRoot);
      expect(fromDocs).toEqual(fromRoot);
      expect(fromRoot.installHooks).toEqual([
        { path: "package.json", name: "postinstall", command: "root" },
        { path: "web/package.json", name: "prepare", command: "web" },
      ]);
      expect(fromRoot.runtimes).toEqual([
        { path: "web/.nvmrc", tool: "node", version: "20" },
      ]);
    });
  });

  describe("skipped", () => {
    const symlinkCases: [string, Files, Files, string][] = [
      [
        "a package.json symlink",
        { "real.json": JSON.stringify({ scripts: { postinstall: "evil" } }) },
        { "package.json": "real.json" },
        "package.json",
      ],
      [
        "a lockfile symlink",
        {},
        { "package-lock.json": "x" },
        "package-lock.json",
      ],
      [
        "a Makefile symlink",
        { "real.mk": "install:\n" },
        { Makefile: "real.mk" },
        "Makefile",
      ],
      ["a setup script symlink", {}, { "bin/setup": "x" }, "bin/setup"],
      [
        "a README symlink",
        { "AGENTS.md": "## Setup\n" },
        { "README.md": "AGENTS.md" },
        "README.md",
      ],
      ["a runtime pin symlink", {}, { ".nvmrc": "x" }, ".nvmrc"],
    ];

    it.each(symlinkCases)("never reads %s", (_name, files, links, path) => {
      const lockfileIsLink = path === "package-lock.json";
      const lock: Files = lockfileIsLink ? {} : { "package-lock.json": "{}\n" };
      const result = hints({ ...files, ...lock }, undefined, links);

      expect(result.skipped).toEqual([{ path, reason: "symlink" }]);
      expect(result.installHooks).toEqual([]);
      expect(result.lockfiles).toEqual(
        lockfileIsLink
          ? []
          : [
              {
                path: "package-lock.json",
                manager: "npm",
                likelyCommand: "npm ci",
              },
            ],
      );
    });

    it("skips a symlinked .env.example and falls back to .env.dist", () => {
      const result = hints({ ".env.dist": "A=1\n" }, undefined, {
        ".env.example": "/etc/passwd",
      });

      expect(result.envExample).toBe(".env.dist");
      expect(result.skipped).toEqual([
        { path: ".env.example", reason: "symlink" },
      ]);
      expect(
        hints({}, undefined, { ".env.example": "x" }).envExample,
      ).toBeNull();
    });

    it("offers no example when the tree tracks .env, as a file or as a symlink", () => {
      expect(
        hints({ ".env": "A=1\n", ".env.example": "A=1\n" }).envExample,
      ).toBeNull();
      expect(
        hints({ ".env.example": "A=1\n" }, undefined, {
          ".env": "/etc/passwd",
        }).envExample,
      ).toBeNull();
    });

    it("lists the target of a symlinked README when it is tracked itself", () => {
      const result = hints({ "AGENTS.md": "## Setup\n" }, undefined, {
        "README.md": "AGENTS.md",
      });

      expect(result.entryPoints).toEqual([
        { path: "AGENTS.md", kind: "docs-section", names: ["Setup"] },
      ]);
    });

    it.each([
      "package.json",
      "package-lock.json",
      "Makefile",
      "bin/setup",
      ".nvmrc",
      "web/composer.lock",
    ])("never reads %s when it is a submodule", (path) => {
      const { cwd, sha } = makeRepo({ "web/composer.json": "{}\n" });

      git(cwd, "update-index", "--add", "--cacheinfo", `160000,${sha},${path}`);
      git(cwd, "commit", "-q", "-m", "link");

      const result = hintsFor(cwd, git(cwd, "rev-parse", "HEAD"));

      expect(result.skipped).toEqual([{ path, reason: "submodule" }]);
      expect(result.entryPoints).toEqual([]);
    });

    it("reports an unreadable file and still lists the rest", () => {
      const { cwd, sha } = makeRepo({
        "package.json": JSON.stringify({ scripts: { postinstall: "x" } }),
        "composer.lock": "{}\n",
        "composer.json": JSON.stringify({ scripts: { init: "y" } }),
      });
      const blob = git(cwd, "rev-parse", `${sha}:package.json`);

      rmSync(join(cwd, ".git", "objects", blob.slice(0, 2), blob.slice(2)));

      const result = hintsFor(cwd, sha);

      expect(result.skipped).toEqual([
        { path: "package.json", reason: "unreadable" },
      ]);
      expect(result.lockfiles).toHaveLength(1);
      expect(result.installHooks).toEqual([
        { path: "composer.json", name: "init", command: "y" },
      ]);
    });

    it.each([
      ["a truncated document", "{"],
      ["an array", "[]"],
      ["null", "null"],
      ["a string", '"x"'],
      ["an empty file", ""],
    ])("reports %s as invalid-json", (_name, text) => {
      const result = hints({ "package.json": text, "composer.json": text });

      expect(result.skipped).toEqual([
        { path: "composer.json", reason: "invalid-json" },
        { path: "package.json", reason: "invalid-json" },
      ]);
    });

    it("strips a leading byte order mark before parsing", () => {
      const result = hints({
        "package.json": `﻿${JSON.stringify({ scripts: { postinstall: "bom" } })}`,
      });

      expect(result.installHooks).toEqual([
        { path: "package.json", name: "postinstall", command: "bom" },
      ]);
      expect(result.skipped).toEqual([]);
    });

    it("sorts by path, then reason", () => {
      const result = hints(
        { "package.json": "{", "-d/package.json": "{}\n", "a/-d/x": "y" },
        undefined,
        { "-d/package-lock.json": "x", Makefile: "x" },
      );

      expect(result.skipped).toEqual([
        { path: "-d/package-lock.json", reason: "symlink" },
        { path: "-d/package-lock.json", reason: "unsafe-path" },
        { path: "-d/package.json", reason: "unsafe-path" },
        { path: "Makefile", reason: "symlink" },
        { path: "package.json", reason: "invalid-json" },
      ]);
    });

    it("has exactly the documented reasons in the schema", () => {
      expect(schemaEnum("skipped", "[]", "reason")).toEqual([
        "symlink",
        "submodule",
        "unreadable",
        "invalid-json",
        "unsafe-path",
      ]);
    });
  });

  describe("unsafe paths", () => {
    it.each(unsafeDirs)(
      "keeps %j out of the lists but shows its hooks",
      (dir) => {
        const result = hints({
          [`${dir}/package-lock.json`]: "{}\n",
          [`${dir}/package.json`]: JSON.stringify({
            scripts: { setup: "x", postinstall: "hook" },
            engines: { node: ">=22" },
          }),
          [`${dir}/.nvmrc`]: "22\n",
        });

        expect(result.lockfiles).toEqual([]);
        expect(result.entryPoints).toEqual([]);
        expect(result.runtimes).toEqual([]);
        expect(result.tools).toEqual([]);
        expect(result.installHooks).toEqual([
          { path: `${dir}/package.json`, name: "postinstall", command: "hook" },
        ]);
        expect(result.skipped).toEqual([
          { path: `${dir}/package-lock.json`, reason: "unsafe-path" },
          { path: `${dir}/package.json`, reason: "unsafe-path" },
        ]);
      },
    );

    it("lists a path made only of allowed characters", () => {
      const dir = "my dir@1+x_y.z-w";
      const result = hints({
        [`${dir}/package-lock.json`]: "{}\n",
        [`${dir}/package.json`]: JSON.stringify({ scripts: { setup: "x" } }),
      });

      expect(result.lockfiles).toHaveLength(1);
      expect(result.entryPoints).toEqual([
        { path: `${dir}/package.json`, kind: "npm-script", names: ["setup"] },
      ]);
      expect(result.skipped).toEqual([]);
    });
  });

  describe("hook lists", () => {
    it.each(npmHooks)("lists the npm hook %s", (name) => {
      const result = hints({
        "package.json": JSON.stringify({ scripts: { [name]: "x" } }),
      });

      expect(result.installHooks).toEqual([
        { path: "package.json", name, command: "x" },
      ]);
      expect(result.entryPoints).toEqual([]);
    });

    it.each(composerHooks)("lists the composer hook %s", (name) => {
      const result = hints({
        "composer.json": JSON.stringify({ scripts: { [name]: "x" } }),
      });

      expect(result.installHooks).toEqual([
        { path: "composer.json", name, command: "x" },
      ]);
      expect(result.entryPoints).toEqual([]);
    });
  });

  describe("recognised files", () => {
    it.each(pinCases)("reads the pin file %s", (file, tool) => {
      const result = hints({ [file]: "3.1\n" });

      expect(result.runtimes).toEqual([{ path: file, tool, version: "3.1" }]);
    });

    it.each(scriptFiles)("lists the setup script %s", (path) => {
      const result = hints({ [path]: "#!/bin/sh\n" });

      expect(result.entryPoints).toEqual([
        { path, kind: "script-file", names: [] },
      ]);
    });

    it.each(docsFiles)("lists install headings in %s", (path) => {
      const result = hints({ [path]: "# T\n## Setup\n" });

      expect(result.entryPoints).toEqual([
        { path, kind: "docs-section", names: ["Setup"] },
      ]);
    });

    it.each(entryFileCases)(
      "lists install targets in %s",
      (path, kind, text, name) => {
        const result = hints({ [path]: text });

        expect(result.entryPoints).toEqual([{ path, kind, names: [name] }]);
        expect(result.tools).toEqual([{ name: kind, onPath: false }]);
      },
    );

    it.each(lockfileCases)(
      "names the tool for %s",
      (file, extra, _manager, _command, tool) => {
        const result = hints({ [file]: "x\n", ...extra }, makeBin([tool]));

        expect(result.tools).toEqual([{ name: tool, onPath: true }]);
      },
    );

    it("keeps assignments out of the justfile recipes", () => {
      const result = hints({
        justfile: "install_dir := 'x'\nsetup := \"y\"\ninstall:\n  echo\n",
      });

      expect(result.entryPoints).toEqual([
        { path: "justfile", kind: "just", names: ["install"] },
      ]);
    });

    it("drops comments from .tool-versions", () => {
      const result = hints({
        ".tool-versions": "# pinned\nphp 8.4 # current\nnodejs 22\n",
      });

      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "nodejs", version: "22" },
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    });

    it("reads entry points and runtimes only at the root and in lockfile directories", () => {
      const result = hints({
        "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
        "package-lock.json": "{}\n",
        "packages/a/package.json": JSON.stringify({
          scripts: { setup: "x", postinstall: "hook" },
          engines: { node: ">=18" },
        }),
        "packages/b/composer.json": JSON.stringify({
          scripts: { "install-deps": "x" },
          require: { php: "^8.1" },
        }),
      });

      expect(result.entryPoints).toEqual([]);
      expect(result.runtimes).toEqual([]);
      expect(result.installHooks).toEqual([
        {
          path: "packages/a/package.json",
          name: "postinstall",
          command: "hook",
        },
      ]);
    });

    it("has exactly the produced kinds and managers in the schema", () => {
      const kinds = hints({
        Makefile: "install:\n",
        justfile: "install:\n  echo\n",
        "Taskfile.yml": "tasks:\n  install:\n",
        "bin/setup": "x\n",
        "README.md": "## Setup\n",
        "package.json": JSON.stringify({ scripts: { setup: "x" } }),
        "composer.json": JSON.stringify({ scripts: { setup: "x" } }),
      }).entryPoints;
      const produced = Array.isArray(kinds)
        ? kinds.flatMap((entry) => (isJson(entry) ? [entry.kind] : []))
        : [];
      const managers = lockfileCases.map(([, , manager]) => manager);

      expect([...new Set(produced)].sort()).toEqual(
        schemaEnum("entryPoints", "[]", "kind").map(String).sort(),
      );
      expect([...new Set(managers)].sort()).toEqual(
        schemaEnum("lockfiles", "[]", "manager").map(String).sort(),
      );
    });
  });

  describe("PATH handling", () => {
    const fakeScript = (marker: string): string =>
      `#!/bin/sh\necho ran > '${marker}'\nexit 1\n`;

    it.each([
      ["a relative entry", "fakebin", "fakebin/git"],
      ["an empty entry", "", "git"],
    ])("never runs a git found through %s", (_name, entry, relative) => {
      const { cwd, sha } = makeRepo();
      const marker = join(cwd, "marker");

      write(cwd, relative, fakeScript(marker));
      chmodSync(join(cwd, relative), 0o755);

      const result = run(cwd, sha, `${entry}${delimiter}${makeBin()}`);

      expect(result.status).toBe(0);
      expect(() => readFileSync(marker)).toThrow();
    });

    it("exits 1 with a message when git is not on PATH", () => {
      const { cwd, sha } = makeRepo();
      const result = run(cwd, sha, sandbox.makeDir("no-git"));

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("git");
    });

    it.each([
      ["a relative entry", "fakebin"],
      ["an empty entry", ""],
    ])("ignores a tool found through %s", (_name, entry) => {
      const { cwd, sha } = makeRepo({ "composer.lock": "{}\n" });

      write(cwd, join(entry, "composer"), "#!/bin/sh\n");
      chmodSync(join(cwd, entry, "composer"), 0o755);

      const result = hintsFor(cwd, sha, `${entry}${delimiter}${makeBin()}`);

      expect(result.tools).toEqual([{ name: "composer", onPath: false }]);
    });

    it("needs the executable bit", () => {
      const bin = makeBin(["composer"]);

      chmodSync(join(bin, "composer"), 0o644);

      expect(hints({ "composer.lock": "{}\n" }, bin).tools).toEqual([
        { name: "composer", onPath: false },
      ]);
    });

    it("needs a file, not a directory", () => {
      const bin = makeBin();

      mkdirSync(join(bin, "composer"), { mode: 0o755 });

      expect(hints({ "composer.lock": "{}\n" }, bin).tools).toEqual([
        { name: "composer", onPath: false },
      ]);
    });

    it("hands a ref that looks like an option to no git process", () => {
      const { cwd } = makeRepo();
      const bin = makeBin();
      const log = join(cwd, "git.log");

      rmSync(join(bin, "git"));
      writeFileSync(
        join(bin, "git"),
        `#!/bin/sh\necho "$@" >> '${log}'\nexec '${realGit}' "$@"\n`,
      );
      chmodSync(join(bin, "git"), 0o755);

      const result = run(cwd, "--output=/tmp/x", bin);

      expect(result.status).toBe(1);
      expect(() => readFileSync(log)).toThrow();
    });
  });

  describe("line parsing", () => {
    it("parses a 160 KB heading line in linear time", () => {
      const spaces = " ".repeat(hugeLine);
      const started = Date.now();
      const result = hints({
        "README.md": `# a${spaces}b\n## Setup${spaces}y #\n`,
      });

      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.entryPoints).toEqual([
        {
          path: "README.md",
          kind: "docs-section",
          names: [`Setup${spaces}y`],
        },
      ]);
    }, 60_000);

    it("parses a 160 KB comment line in .tool-versions in linear time", () => {
      const started = Date.now();
      const result = hints({
        ".tool-versions": `${"#".repeat(hugeLine)}\r\nphp 8.4\r\n`,
      });

      expect(Date.now() - started).toBeLessThan(5000);
      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    }, 60_000);

    it("gives no runtime for a CRLF .tool-versions comment", () => {
      const result = hints({
        ".tool-versions": "# tool versions\r\nphp 8.4\r\n",
      });

      expect(result.runtimes).toEqual([
        { path: ".tool-versions", tool: "php", version: "8.4" },
      ]);
    });

    it("splits CRLF docs, make, just and task files", () => {
      const result = hints({
        "README.md": "## Setup\r\n",
        Makefile: "install:\r\n",
        justfile: "setup:\r\n  echo\r\n",
        "Taskfile.yml": "tasks:\r\n  install:\r\n    cmds: []\r\n",
      });

      expect(result.entryPoints).toEqual([
        { path: "Makefile", kind: "make", names: ["install"] },
        { path: "README.md", kind: "docs-section", names: ["Setup"] },
        { path: "Taskfile.yml", kind: "task", names: ["install"] },
        { path: "justfile", kind: "just", names: ["setup"] },
      ]);
    });
  });
});
