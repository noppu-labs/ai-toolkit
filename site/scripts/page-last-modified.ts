import { execFileSync } from "node:child_process";
import { posix } from "node:path";
import { resolveExecutable } from "../../scripts/resolve-executable.ts";
import type { SkillEntry } from "../src/catalog-types.ts";
import { canonicalUrl } from "../src/lib/head.ts";
import { pluginPath, skillPath } from "../src/lib/site.ts";
import { PLUGIN_COPY_DIR } from "./plugin-copy.ts";

export const NO_HISTORY_WARNING =
  "sitemap: no git history (shallow clone?), so pages get no lastmod";

export interface DatedPage {
  /** Root-relative, such as /skills/deep. */
  path: string;
  /** Paths from the repo root whose latest commit dates the page. */
  sources: readonly string[];
}

export interface PagesLastModified {
  /** Each dated page's canonical URL to an ISO 8601 date. */
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

export function skillDatedPages(
  skills: readonly Pick<SkillEntry, "name" | "path">[],
): DatedPage[] {
  return skills.map((skill) => ({
    path: skillPath(skill.name),
    sources: [posix.dirname(skill.path)],
  }));
}

export function pluginDatedPages(plugins: readonly string[]): DatedPage[] {
  return plugins.map((name) => ({
    path: pluginPath(name),
    sources: [name, `site/${PLUGIN_COPY_DIR}/${name}.yaml`],
  }));
}

/**
 * Returns no dates in a shallow clone, where the oldest commit would claim every file and date
 * every page wrongly.
 */
export function pagesLastModified(
  rootDir: string,
  pages: readonly DatedPage[],
): PagesLastModified {
  const dates = new Map<string, string>();

  try {
    const git = resolveExecutable("git");

    if (
      runGit(git, rootDir, ["rev-parse", "--is-shallow-repository"]) !== "false"
    ) {
      return { dates, warning: NO_HISTORY_WARNING };
    }

    for (const page of pages) {
      const date = runGit(git, rootDir, [
        "log",
        "-1",
        "--format=%cI",
        "--",
        ...page.sources,
      ]);

      if (date !== "") {
        dates.set(canonicalUrl(page.path), date);
      }
    }
  } catch (error: unknown) {
    return {
      dates: new Map(),
      warning: stderrOf(error).includes("not a git repository")
        ? NO_HISTORY_WARNING
        : `sitemap: could not read page dates from git (${describeError(error)}), so pages get no lastmod`,
    };
  }

  return { dates, warning: undefined };
}
