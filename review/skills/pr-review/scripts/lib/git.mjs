import { spawnSync } from "node:child_process";

const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" };

// Every call is an argument array to the resolved absolute git path, so
// nothing passes through a shell. `run` reports the exit status; `text`
// throws on failure and returns stdout.
export function makeGit(gitPath, cwd) {
  const run = (args) => {
    const result = spawnSync(gitPath, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      env: { ...process.env, ...GIT_ENV },
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
