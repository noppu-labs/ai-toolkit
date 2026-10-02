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

export function probe(cmd, env = process.env) {
  const res = run(cmd, ["--version"], { timeout: 5_000, env });
  return !res.error && res.status === 0;
}
