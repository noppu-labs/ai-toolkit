import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { skillPath } from "../src/lib/site.ts";
import { skillLastModified } from "./skill-last-modified.ts";

const SKILLS = [
  { name: "a", path: "p/skills/a/SKILL.md" },
  { name: "b", path: "p/skills/b/SKILL.md" },
];
const FIRST = "2026-01-01T00:00:00Z";
const SECOND = "2026-02-01T00:00:00Z";

const roots: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-last-modified-"));
  roots.push(dir);

  return dir;
}

function git(cwd: string, date: string, ...args: string[]): void {
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    {
      cwd,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_COMMITTER_DATE: date,
        GIT_AUTHOR_DATE: date,
      },
    },
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
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("skillLastModified", () => {
  it("dates each skill page by the last commit to its directory", () => {
    const dates = skillLastModified(makeRepo(), SKILLS);

    expect(isoDates(dates)).toEqual({
      [`https://toolkit.noppu.com${skillPath("a")}`]: new Date(
        FIRST,
      ).toISOString(),
      [`https://toolkit.noppu.com${skillPath("b")}`]: new Date(
        SECOND,
      ).toISOString(),
    });
  });

  it("dates nothing in a shallow clone", () => {
    const repo = makeRepo();
    const clone = join(makeTempDir(), "clone");
    execFileSync(
      "git",
      ["clone", "-q", "--depth", "1", `file://${repo}`, clone],
      {
        stdio: "ignore",
      },
    );

    expect(skillLastModified(clone, SKILLS).size).toBe(0);
  });

  it("dates nothing outside a git repository", () => {
    expect(skillLastModified(makeTempDir(), SKILLS).size).toBe(0);
  });
});
