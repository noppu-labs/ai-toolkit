import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skillPath } from "../src/lib/site.ts";
import {
  NO_HISTORY_WARNING,
  pagesLastModified,
  pluginDatedPages,
  skillDatedPages,
} from "./page-last-modified.ts";

const SKILLS = [
  { name: "a", path: "p/skills/a/SKILL.md" },
  { name: "b", path: "p/skills/b/SKILL.md" },
];
const FIRST = "2026-01-01T00:00:00Z";
const SECOND = "2026-02-01T00:00:00Z";

const roots: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "page-last-modified-"));
  roots.push(dir);

  return dir;
}

/** The environment for a git call in a temp repo: no inherited repository variables, config, or ceiling. */
function makeGitEnv(date: string = FIRST): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_")) {
      env[key] = value;
    }
  }

  return {
    ...env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
    GIT_COMMITTER_DATE: date,
    GIT_AUTHOR_DATE: date,
  };
}

function git(cwd: string, date: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "core.hooksPath=/dev/null",
      // `git commit` otherwise starts a detached maintenance run that can write
      // into .git/objects while a test is deleting it.
      "-c",
      "maintenance.auto=false",
      "-c",
      "gc.auto=0",
      ...args,
    ],
    { cwd, stdio: "ignore", env: makeGitEnv(date) },
  );
}

function commitFile(
  repo: string,
  file: string,
  date: string,
  message: string,
): void {
  const full = join(repo, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${message}\n`);
  git(repo, date, "add", "-A");
  git(repo, date, "commit", "-m", message);
}

function makeRepo(): string {
  const repo = makeTempDir();
  git(repo, FIRST, "init", "-q");
  commitFile(repo, SKILLS[0]?.path ?? "", FIRST, "add a");
  commitFile(repo, SKILLS[1]?.path ?? "", FIRST, "add b");
  commitFile(repo, SKILLS[1]?.path ?? "", SECOND, "change b");

  return repo;
}

function isoDates(map: Map<string, string>): Record<string, string> {
  return Object.fromEntries(
    [...map].map(([url, date]) => [url, new Date(date).toISOString()]),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("pagesLastModified", () => {
  it("dates each skill page by the last commit to its directory", () => {
    const { dates, warning } = pagesLastModified(
      makeRepo(),
      skillDatedPages(SKILLS),
    );

    expect(isoDates(dates)).toEqual({
      [`https://toolkit.noppu.com${skillPath("a")}`]: new Date(
        FIRST,
      ).toISOString(),
      [`https://toolkit.noppu.com${skillPath("b")}`]: new Date(
        SECOND,
      ).toISOString(),
    });
    expect(warning).toBeUndefined();
  });

  it("dates a page by the latest commit to any of its sources", () => {
    const { dates } = pagesLastModified(makeRepo(), [
      { path: "/plugins/x", sources: ["p/skills/a", "p/skills/b"] },
    ]);

    expect(isoDates(dates)).toEqual({
      "https://toolkit.noppu.com/plugins/x": new Date(SECOND).toISOString(),
    });
  });

  it("skips a source git has never seen and still dates the page", () => {
    const { dates, warning } = pagesLastModified(makeRepo(), [
      {
        path: "/plugins/x",
        sources: ["p/skills/a", "site/src/content/plugins/x.yaml"],
      },
    ]);

    expect(Object.keys(isoDates(dates))).toEqual([
      "https://toolkit.noppu.com/plugins/x",
    ]);
    expect(warning).toBeUndefined();
  });

  it("dates nothing in a shallow clone, and says why", () => {
    const repo = makeRepo();
    const clone = join(makeTempDir(), "clone");
    execFileSync(
      "git",
      ["clone", "-q", "--depth", "1", `file://${repo}`, clone],
      {
        stdio: "ignore",
        env: makeGitEnv(),
      },
    );

    expect(pagesLastModified(clone, skillDatedPages(SKILLS))).toEqual({
      dates: new Map(),
      warning: NO_HISTORY_WARNING,
    });
  });

  it("dates nothing outside a git repository, with the same warning", () => {
    vi.stubEnv("GIT_CEILING_DIRECTORIES", realpathSync(tmpdir()));

    expect(pagesLastModified(makeTempDir(), skillDatedPages(SKILLS))).toEqual({
      dates: new Map(),
      warning: NO_HISTORY_WARNING,
    });
  });

  it("names a missing git instead of blaming a shallow clone", () => {
    const repo = makeRepo();
    vi.stubEnv("PATH", makeTempDir());

    expect(pagesLastModified(repo, skillDatedPages(SKILLS))).toEqual({
      dates: new Map(),
      warning:
        "sitemap: could not read page dates from git (`git` not found on PATH), so pages get no lastmod",
    });
  });

  it("names the error git printed when it fails for another reason", () => {
    const repo = makeRepo();
    // Without its objects the repository is still one, but `git log` cannot read HEAD.
    rmSync(join(repo, ".git", "objects"), { recursive: true });
    mkdirSync(join(repo, ".git", "objects"));

    expect(pagesLastModified(repo, skillDatedPages(SKILLS))).toEqual({
      dates: new Map(),
      warning:
        "sitemap: could not read page dates from git (fatal: bad object HEAD), so pages get no lastmod",
    });
  });

  it("names an error thrown while building a page's URL", () => {
    const { dates, warning } = pagesLastModified(makeRepo(), [
      ...skillDatedPages([SKILLS[0] ?? { name: "a", path: "" }]),
      // A host that is never closed makes `new URL` throw a TypeError.
      { path: "//[", sources: ["p/skills/b"] },
    ]);

    expect(dates.size).toBe(0);
    expect(warning).toBe(
      "sitemap: could not read page dates from git (Invalid URL), so pages get no lastmod",
    );
  });
});

describe("pluginDatedPages", () => {
  it("dates a plugin page by its directory and its page manifest", () => {
    expect(pluginDatedPages(["review"])).toEqual([
      {
        path: "/plugins/review",
        sources: ["review", "site/src/content/plugins/review.yaml"],
      },
    ]);
  });
});
