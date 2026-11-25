import { spawnSync } from "node:child_process";

const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };

// The user's environment must not turn pathspec magic such as `:(glob)` off or
// on.
const PATHSPEC_VARS = [
  "GIT_LITERAL_PATHSPECS",
  "GIT_GLOB_PATHSPECS",
  "GIT_NOGLOB_PATHSPECS",
  "GIT_ICASE_PATHSPECS",
];

// A git hook, or a linked worktree's hook, exports these, and they would point
// every call here at that repository instead of the directory it runs in.
const LOCATION_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
];

function makeEnv() {
  const env = { ...process.env, ...GIT_ENV };

  for (const name of [...PATHSPEC_VARS, ...LOCATION_VARS]) {
    delete env[name];
  }

  return env;
}

// Every call is an argument array to the resolved absolute git path, so
// nothing passes through a shell. `run` reports the exit status; `text`
// throws on failure and returns stdout.
export function makeGit(gitPath, cwd) {
  const run = (args) => {
    const result = spawnSync(gitPath, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      env: makeEnv(),
    });

    return {
      status: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? result.error?.message ?? "",
    };
  };
  const text = (args) => {
    const result = run(args);

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
    }

    return result.stdout;
  };

  return { run, text };
}
