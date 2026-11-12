import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { resolveExecutable } from "../../scripts/resolve-executable.ts";
import type { SkillEntry } from "../src/catalog-types.ts";
import { canonicalUrl } from "../src/lib/head.ts";
import { skillPath } from "../src/lib/site.ts";

export const NO_HISTORY_WARNING =
  "sitemap: no git history (shallow clone?), so skill pages get no lastmod";

export interface SkillLastModified {
  /** Each skill page's canonical URL to an ISO 8601 date. */
  dates: Map<string, string>;
  /** Why `dates` is empty, when it is. */
  warning: string | undefined;
}

function runGit(git: string, rootDir: string, args: readonly string[]): string {
  return execFileSync(git, args, {
    cwd: rootDir,
    encoding: "utf8",
    // `LC_ALL=C` keeps git's messages in English, so a missing repository is recognisable.
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** What git printed on stderr before failing, or `""` when the error did not come from git. */
function stderrOf(error: unknown): string {
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error
      ? error.stderr
      : undefined;

  return typeof stderr === "string" ? stderr.trim() : "";
}

function describeError(error: unknown): string {
  const stderr = stderrOf(error);

  if (stderr !== "") {
    return stderr;
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * Returns no dates in a shallow clone, where the oldest commit would claim every file and date
 * every page wrongly.
 */
export function skillLastModified(
  rootDir: string,
  skills: readonly Pick<SkillEntry, "name" | "path">[],
): SkillLastModified {
  const dates = new Map<string, string>();

  try {
    const git = resolveExecutable("git");

    if (
      runGit(git, rootDir, ["rev-parse", "--is-shallow-repository"]) !== "false"
    ) {
      return { dates, warning: NO_HISTORY_WARNING };
    }

    for (const skill of skills) {
      const date = runGit(git, rootDir, [
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
  } catch (error: unknown) {
    return {
      dates: new Map(),
      warning: stderrOf(error).includes("not a git repository")
        ? NO_HISTORY_WARNING
        : `sitemap: could not read skill dates from git (${describeError(error)}), so skill pages get no lastmod`,
    };
  }

  return { dates, warning: undefined };
}
