import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterAll } from "vitest";
import { makeSandbox, realGit, type Sandbox } from "../review-test-git.ts";

const reviewDir = join(
  import.meta.dirname,
  "..",
  "..",
  "review",
  "skills",
  "pr-review",
);
export const script = join(reviewDir, "scripts", "install-hints.mjs");
const schemaPath = join(reviewDir, "references", "install-hints.schema.json");

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};
export type Files = Record<string, string>;
type Json = Record<string, unknown>;
export type Schema = {
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

export let sandbox: Sandbox;

// Each test file calls this once at module level. The exported binding is
// live, so a test body reads the current sandbox.
export function registerSandbox(): void {
  sandbox = makeSandbox("review-install-hints-");

  afterAll(() => {
    sandbox.dispose();
  });
}

export function git(cwd: string, ...args: string[]): string {
  return sandbox.git(cwd, ...args);
}

export function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

export function commitFiles(
  cwd: string,
  files: Files,
  links: Files = {},
): string {
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

export function makeRepo(
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

export function makeBin(executables: string[] = []): string {
  const bin = sandbox.makeDir("bin");

  symlinkSync(realGit, join(bin, "git"));

  for (const name of executables) {
    writeFileSync(join(bin, name), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, name), 0o755);
  }

  return bin;
}

export function run(
  cwd: string,
  sha?: string,
  bin: string = makeBin(),
): RunResult {
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

export function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOutput(stdout: string): Json {
  const value: unknown = JSON.parse(stdout);

  if (!isJson(value)) {
    throw new Error("install-hints did not print an object");
  }

  return value;
}

export function hintsFor(cwd: string, sha: string, bin?: string): Json {
  const result = run(cwd, sha, bin);

  if (result.status !== 0) {
    throw new Error(`install-hints failed: ${result.stderr}`);
  }

  return parseOutput(result.stdout);
}

export function hints(files: Files, bin?: string, links: Files = {}): Json {
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

export function parseSchema(value: unknown, path = "$"): Schema {
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

export function readSchema(): Schema {
  const value: unknown = JSON.parse(readFileSync(schemaPath, "utf8"));

  return parseSchema(value);
}

export function schemaEnum(...path: string[]): unknown[] {
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

export function validate(schema: Schema, value: unknown, path = "$"): string[] {
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

export const lockfileCases: [string, Files, string, string, string][] = [
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
