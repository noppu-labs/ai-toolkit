import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeEach } from "vitest";
import { makeSandbox, realGit, type Sandbox } from "../review-test-git.ts";

export const script = join(
  import.meta.dirname,
  "..",
  "..",
  "review",
  "skills",
  "pr-review",
  "scripts",
  "head-setup.mjs",
);

export type Json = Record<string, unknown>;
export type Files = Record<string, string>;
export type Fixture = { dir: string; base: string; head: string };
export type Outcome = { status: number | null; json: Json; stderr: string };
type CommitOptions = { links?: Files; executable?: string[] };

export let sandboxRoot: Sandbox;
export let sandbox: string;
export let scratch: string;
let counter = 0;

// Each test file calls this once at module level. The exported bindings are
// live, so a test body reads the current sandbox and scratch directory.
export function registerSandbox(): void {
  sandboxRoot = makeSandbox("review-head-setup-");
  sandbox = sandboxRoot.root;
  scratch = join(sandbox, "scratch");

  beforeEach(() => {
    scratch = nextPath("scratch");
    mkdirSync(scratch);
  });

  afterAll(() => {
    sandboxRoot.dispose();
  });
}

export function nextPath(label: string): string {
  counter += 1;

  return join(sandbox, `${label}-${counter}`);
}

export function tryGit(
  cwd: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  return sandboxRoot.tryGit(cwd, ...args);
}

export function git(cwd: string, ...args: string[]): string {
  return sandboxRoot.git(cwd, ...args);
}

export function write(cwd: string, path: string, content: string): void {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
}

export function commit(
  cwd: string,
  files: Files,
  { links = {}, executable = [] }: CommitOptions = {},
): string {
  for (const [path, content] of Object.entries(files)) {
    write(cwd, path, content);
  }

  for (const path of executable) {
    chmodSync(join(cwd, path), 0o755);
  }

  for (const [path, target] of Object.entries(links)) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    symlinkSync(target, join(cwd, path));
  }

  git(cwd, "add", "-f", "-A");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "change");

  return git(cwd, "rev-parse", "HEAD");
}

export function makeRepo(
  files: Files = {},
  options: CommitOptions = {},
): string {
  const dir = nextPath("repo");

  mkdirSync(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "t@example.com");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  commit(dir, { "notes.txt": "x\n", ...files }, options);

  return dir;
}

export function makeHead(
  dir: string,
  files: Files,
  options: CommitOptions & { from?: string } = {},
): string {
  counter += 1;

  const branch = `pr-${counter}`;
  const original = git(dir, "rev-parse", "--abbrev-ref", "HEAD");

  git(dir, "switch", "-q", "-c", branch, options.from ?? original);

  const sha = commit(dir, files, options);

  git(dir, "switch", "-q", original);

  return sha;
}

export function makeFixture(
  base: Files,
  head: Files,
  options: CommitOptions = {},
): Fixture {
  const dir = makeRepo(base);
  const baseSha = git(dir, "rev-parse", "HEAD");

  return { dir, base: baseSha, head: makeHead(dir, head, options) };
}

export function makeBin(wrapper?: string): string {
  const bin = mkdtempSync(join(sandbox, "bin-"));

  if (wrapper === undefined) {
    symlinkSync(realGit, join(bin, "git"));
  } else {
    writeFileSync(join(bin, "git"), wrapper.replaceAll("REAL_GIT", realGit));
    chmodSync(join(bin, "git"), 0o755);
  }

  return bin;
}

export function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function run(
  cwd: string,
  args: string[],
  bin: string = makeBin(),
  env: Record<string, string> = {},
): Outcome {
  sandboxRoot.assertInside(cwd);

  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: sandboxRoot.env({ PATH: bin, TMPDIR: scratch, ...env }),
  });
  const parsed: unknown = JSON.parse(result.stdout);

  if (!isJson(parsed)) {
    throw new Error(`head-setup printed ${result.stdout}`);
  }

  return { status: result.status, json: parsed, stderr: result.stderr };
}

export function switchCommand(
  dir: string,
  name: string,
  discard = false,
): string {
  const flags = discard
    ? "--discard-changes --no-guess --no-overwrite-ignore"
    : "--no-guess --no-overwrite-ignore";

  return `git -c core.hooksPath=/dev/null -c submodule.recurse=false -C ${dir} switch ${flags} ${name}`;
}

function runShell(command: string, cwd: string): void {
  sandboxRoot.assertInside(cwd);
  spawnSync("sh", ["-c", command], {
    cwd,
    encoding: "utf8",
    env: sandboxRoot.env(),
  });
}

export function runPrinted(command: string, dir: string): void {
  for (const part of command.split(" && ")) {
    if (!part.includes(` -C ${dir} `)) {
      throw new Error(`a git in the printed command has no -C ${dir}: ${part}`);
    }
  }

  runShell(command, dir);
}

export function listAt(json: Json, key: string): Json[] {
  const value = json[key];

  if (!Array.isArray(value)) {
    throw new Error(`${key} is not a list`);
  }

  return value.filter(isJson);
}

export function headsOf(outcome: Outcome): Json[] {
  return listAt(outcome.json, "heads");
}

export function plan(dir: string, ...shas: string[]): Json {
  const outcome = run(dir, ["plan", ...shas]);

  if (outcome.status !== 0) {
    throw new Error(`plan failed: ${JSON.stringify(outcome.json)}`);
  }

  return outcome.json;
}

export function enter(dir: string, kind: string, sha: string): Outcome {
  return run(dir, ["enter", kind, sha]);
}

export function gitDirOf(dir: string): string {
  return git(dir, "rev-parse", "--absolute-git-dir");
}

export function recordPath(dir: string): string {
  return join(gitDirOf(dir), "pr-review-setup.json");
}

export function readRecord(dir: string): { entries: Json[] } {
  const parsed: unknown = JSON.parse(readFileSync(recordPath(dir), "utf8"));

  if (!isJson(parsed) || !Array.isArray(parsed.entries)) {
    throw new Error("unexpected record");
  }

  return { entries: parsed.entries.filter(isJson) };
}

export function writeRecord(dir: string, value: unknown): void {
  writeFileSync(recordPath(dir), JSON.stringify(value));
}

export function headOf(dir: string): string {
  return git(dir, "rev-parse", "HEAD");
}

export function branchOf(dir: string): string {
  return tryGit(
    dir,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ).stdout.trim();
}

export function pathOf(outcome: Outcome): string {
  const path = outcome.json.path;

  if (typeof path !== "string") {
    throw new Error("no path in the output");
  }

  return path;
}

export function scratchEntries(): string[] {
  return readdirSync(scratch);
}
