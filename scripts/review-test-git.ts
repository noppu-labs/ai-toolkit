import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, isAbsolute } from "node:path";

export const realGit: string = spawnSync("sh", ["-c", "command -v git"], {
  encoding: "utf8",
}).stdout.trim();

export type GitResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type Sandbox = {
  root: string;
  next: (label: string) => string;
  makeDir: (label: string) => string;
  env: (extra?: Record<string, string>) => Record<string, string>;
  assertInside: (cwd: string) => void;
  tryGit: (cwd: string, ...args: string[]) => GitResult;
  git: (cwd: string, ...args: string[]) => string;
  dispose: () => void;
};

// The test's own git environment: nothing the surrounding shell or a git hook
// exports (GIT_DIR, GIT_INDEX_FILE, ...) reaches a fixture, no global or system
// configuration is read, and no commit or tag is signed.
export function makeGitEnv(
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith("GIT_")) {
      env[name] = value;
    }
  }

  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "commit.gpgsign",
    GIT_CONFIG_VALUE_0: "false",
    GIT_CONFIG_KEY_1: "tag.gpgsign",
    GIT_CONFIG_VALUE_1: "false",
    ...extra,
  };
}

function isInside(root: string, path: string): boolean {
  const offset: string = relative(root, path);

  return offset !== "" && !offset.startsWith("..") && !isAbsolute(offset);
}

// One temporary root per test file. Every git call and every script run must
// name a directory inside it, so a fixture that failed to build can never
// touch the repository the tests run from.
export function makeSandbox(prefix: string): Sandbox {
  const root: string = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  let counter = 0;

  const assertInside = (cwd: string): void => {
    let real: string;

    try {
      real = realpathSync(cwd);
    } catch {
      throw new Error(`refusing to run in ${cwd}: it does not exist`);
    }

    if (real !== root && !isInside(root, real)) {
      throw new Error(`refusing to run in ${cwd}: it is outside ${root}`);
    }
  };

  const tryGit = (cwd: string, ...args: string[]): GitResult => {
    assertInside(cwd);

    const result = spawnSync(realGit, args, {
      cwd,
      encoding: "utf8",
      env: makeGitEnv(),
    });

    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

  return {
    root,
    next: (label) => {
      counter += 1;

      return join(root, `${label}-${counter}`);
    },
    makeDir: (label) => mkdtempSync(join(root, `${label}-`)),
    env: makeGitEnv,
    assertInside,
    tryGit,
    git: (cwd, ...args) => {
      const result = tryGit(cwd, ...args);

      if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
      }

      return result.stdout.trim();
    },
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
