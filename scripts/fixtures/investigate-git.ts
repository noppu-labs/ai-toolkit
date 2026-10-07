import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveExecutable } from "../resolve-executable.ts";

// An empty HOME and no system config, so a developer's commit signing, hooks,
// or identity cannot break fixture repos.
const GIT_HOME: string = mkdtempSync(join(tmpdir(), "investigate-git-home-"));

/** Runs git in a fixture repo and returns trimmed stdout; throws with stderr on failure. */
export function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    resolveExecutable("git"),
    [
      "-c",
      "commit.gpgsign=false",
      "-c",
      "tag.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.email=t@example.com",
      "-c",
      "user.name=t",
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, HOME: GIT_HOME, GIT_CONFIG_NOSYSTEM: "1" },
    },
  );
  if (r.status !== 0) throw new Error(r.stderr);

  return r.stdout.trim();
}
