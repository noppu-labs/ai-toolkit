import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { resolveExecutable } from "../../scripts/resolve-executable.ts";
import { canonicalUrl } from "../src/lib/head.ts";
import { skillPath } from "../src/lib/site.ts";

function runGit(rootDir: string, args: readonly string[]): string {
  return execFileSync(resolveExecutable("git"), args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/**
 * Maps each skill's page URL to the committer date of the last commit that touched
 * the skill's directory. Returns nothing in a shallow clone, where the oldest
 * commit would claim every file and so date every page wrongly, and when git
 * fails or `rootDir` is not a repository.
 */
export function skillLastModified(
  rootDir: string,
  skills: readonly { name: string; path: string }[],
): Map<string, string> {
  const dates = new Map<string, string>();

  try {
    if (runGit(rootDir, ["rev-parse", "--is-shallow-repository"]) !== "false") {
      return dates;
    }

    for (const skill of skills) {
      const date = runGit(rootDir, [
        "log",
        "-1",
        "--format=%cI",
        "--",
        posix.dirname(skill.path),
      ]);
      if (date !== "") {
        dates.set(canonicalUrl(skillPath(skill.name)), date);
      }
    }
  } catch {
    return new Map();
  }

  return dates;
}
