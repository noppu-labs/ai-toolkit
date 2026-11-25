import { spawnSync } from "node:child_process";

const DEFAULT_TIMEOUT_MS = 15_000;

export function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
}

// Every git call goes through here: git must not take the working directory
// itself for a repository. Git older than 2.38 ignores the setting, and newer
// ones skip it under some paths, so resolveRepo checks the git directory as
// well.
export function git(args, opts = {}) {
  return run("git", ["-c", "safe.bareRepository=explicit", ...args], opts);
}

// The user's environment must not turn pathspec magic such as
// `:(icase,literal)` off or on.
const PATHSPEC_VARS = [
  "GIT_LITERAL_PATHSPECS",
  "GIT_GLOB_PATHSPECS",
  "GIT_NOGLOB_PATHSPECS",
  "GIT_ICASE_PATHSPECS",
];

/** `env` without the variables that change how git reads a pathspec. */
export function withoutPathspecVars(env) {
  const clean = { ...env };
  for (const name of PATHSPEC_VARS) delete clean[name];
  return clean;
}

export function probe(cmd, env = process.env) {
  const res = run(cmd, ["--version"], { timeout: 5_000, env });
  return !res.error && res.status === 0;
}
