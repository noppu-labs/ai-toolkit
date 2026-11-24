import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "release-notes.sh");

// Keep the host's git config (signing, hooks, identity) out of the temp repos.
const gitEnv: Record<string, string> = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

let repo: string;

function git(...args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...gitEnv },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }

  return result.stdout.trim();
}

function write(path: string, content: string): void {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function manifest(version: string, homepage: string): string {
  return `${JSON.stringify({ name: "demo", version, homepage }, null, 2)}\n`;
}

function commit(message: string): string {
  git("add", "-A");
  git("commit", "-q", "-m", message);

  return git("rev-parse", "--short", "HEAD");
}

function notes(dir: string, prev = ""): string[] {
  const result = spawnSync("bash", [script, dir, prev], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, ...gitEnv },
  });
  if (result.status !== 0) {
    throw new Error(`release-notes.sh failed: ${result.stderr}`);
  }

  return result.stdout.trim().split("\n");
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "release-notes-"));
  git("init", "-q", "-b", "main");
  write("demo/.claude-plugin/plugin.json", manifest("0.1.0", "https://a"));
  write("demo/README.md", "demo\n");
  commit("feat(demo): first");
  git("tag", "demo@0.1.0");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("release-notes.sh", () => {
  it("lists the commits that changed the directory since the previous tag", () => {
    write("demo/README.md", "demo 2\n");
    const sha = commit("fix(demo): second (#2)");
    write("other/file.txt", "x\n");
    commit("chore(other): unrelated");

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- fix(demo): second (#2) (${sha})`,
    ]);
  });

  it("lists every commit, the root one included, when there is no previous tag", () => {
    const root = git("rev-parse", "--short", "HEAD");

    expect(notes("demo")).toEqual([`- feat(demo): first (${root})`]);
  });

  it("leaves out a commit that only edits plugin.json metadata", () => {
    write("demo/.claude-plugin/plugin.json", manifest("0.1.0", "https://b"));
    write("site/page.ts", "x\n");
    commit("feat(site): link plugins to their own pages (#245)");

    expect(notes("demo", "demo@0.1.0")).toEqual(["- Maintenance release"]);
  });

  it("keeps a plugin.json commit that changes the version", () => {
    write("demo/.claude-plugin/plugin.json", manifest("0.2.0", "https://a"));
    const sha = commit("chore(demo): release 0.2.0");

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- chore(demo): release 0.2.0 (${sha})`,
    ]);
  });

  it("keeps a metadata commit that also changes another file in the directory", () => {
    write("demo/.claude-plugin/plugin.json", manifest("0.1.0", "https://b"));
    write("demo/README.md", "demo links\n");
    const sha = commit("docs: link the READMEs (#222)");

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- docs: link the READMEs (#222) (${sha})`,
    ]);
  });

  it("names a GitHub merge commit by the PR title in its body", () => {
    write("demo/README.md", "demo 2\n");
    const sha = commit(
      "Merge pull request #255 from org/feat/branch\n\nfeat(demo): a useful title",
    );

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- feat(demo): a useful title (#255) (${sha})`,
    ]);
  });

  it("does not repeat the PR number when the body's title already ends with it", () => {
    write("demo/README.md", "demo 2\n");
    const sha = commit(
      "Merge pull request #7 from org/feat/branch\n\nfeat(demo): titled (#7)",
    );

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- feat(demo): titled (#7) (${sha})`,
    ]);
  });

  it("keeps the merge subject when the body is empty", () => {
    write("demo/README.md", "demo 2\n");
    const sha = commit("Merge pull request #8 from org/feat/branch");

    expect(notes("demo", "demo@0.1.0")).toEqual([
      `- Merge pull request #8 from org/feat/branch (${sha})`,
    ]);
  });

  it("names a two-parent merge commit by its PR title", () => {
    git("switch", "-q", "-c", "feature");
    write("demo/feature.md", "feature\n");
    const branch = commit("feat(demo): on the branch");
    git("switch", "-q", "main");
    write("demo/README.md", "main side\n");
    const side = commit("fix(demo): on main");
    git(
      "merge",
      "-q",
      "--no-ff",
      "feature",
      "-m",
      "Merge pull request #9 from org/feature",
      "-m",
      "feat(demo): the PR title",
    );
    const merge = git("rev-parse", "--short", "HEAD");

    expect(notes("demo", "demo@0.1.0").sort()).toEqual(
      [
        `- feat(demo): the PR title (#9) (${merge})`,
        `- feat(demo): on the branch (${branch})`,
        `- fix(demo): on main (${side})`,
      ].sort(),
    );
  });

  it("applies no metadata rule to a shared package without plugin.json", () => {
    write("packages/core/package.json", '{"version":"0.1.0"}\n');
    commit("feat(core): add");
    git("tag", "core@0.1.0");
    write("packages/core/package.json", '{"version":"0.1.0","x":1}\n');
    const sha = commit("chore(core): metadata");

    expect(notes("packages/core", "core@0.1.0")).toEqual([
      `- chore(core): metadata (${sha})`,
    ]);
  });
});
