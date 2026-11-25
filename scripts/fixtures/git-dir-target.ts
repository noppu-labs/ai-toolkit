import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./investigate-git.ts";
import { MARKER_TOOL } from "./marker-tool.ts";

export type GitDirRepo = {
  /** The real repository's root. */
  cwd: string;
  /** The subdirectory git takes for a git directory. */
  sub: string;
  /** Written by the marker tool when the subdirectory's config is obeyed. */
  marker: string;
};

export type GitDirOptions = {
  /** Where the planted config says the working tree is, relative to it. */
  worktree?: "." | "..";
  /** The planted directory's name. */
  name?: string;
  /** Also make an ordinary directory named `name` without its outer whitespace. */
  hasTrimmedSibling?: boolean;
  /** Directories between the temporary directory and the repository root. */
  under?: string[];
};

// realpath: on macOS tmpdir is a symlink, and the brief prints real paths.
function makeTempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/**
 * Gives `dir` the shape of a git directory, with a config naming the marker
 * tool as a command to run, and puts two source files in it.
 */
function plantGitDir(dir: string, worktree: "." | ".."): void {
  for (const inner of ["objects", "refs"]) {
    mkdirSync(join(dir, inner), { recursive: true });
    writeFileSync(join(dir, inner, "keep"), "");
  }
  mkdirSync(join(dir, "..x"));
  writeFileSync(join(dir, "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(
    join(dir, "config"),
    [
      "[core]",
      "\trepositoryformatversion = 0",
      "\tbare = false",
      `\tworktree = ${worktree}`,
      `\tfsmonitor = ${MARKER_TOOL}`,
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "thing.ts"),
    "export function pkgThing() { return 1; }\n",
  );
  writeFileSync(
    join(dir, "..x", "inner.ts"),
    "export function innerThing() { return 2; }\n",
  );
}

/**
 * A repository with a tracked subdirectory (`pkg` unless named) that has the
 * shape of a git directory and a config naming the marker tool as a command
 * to run.
 */
export function makeGitDirRepo(options: GitDirOptions = {}): GitDirRepo {
  const { worktree = ".", name = "pkg", under = [] } = options;
  const cwd = join(makeTempDir("investigate-gitdir-"), ...under);
  const sub = join(cwd, name);
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q", "-b", "main");
  plantGitDir(sub, worktree);

  if (options.hasTrimmedSibling) {
    mkdirSync(join(cwd, name.trim()));
    writeFileSync(
      join(cwd, name.trim(), "plain.ts"),
      "export function plainThing() { return 3; }\n",
    );
  }

  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");

  return { cwd, sub, marker: join(cwd, "marker.txt") };
}

/**
 * A working tree whose root directory is named `repo ` (a trailing space),
 * beside a directory named `repo` that has the shape of a git directory.
 * `cwd` is the working tree and `sub` the directory beside it.
 */
export function makeSpaceRootRepo(): GitDirRepo {
  const base = makeTempDir("investigate-space-root-");
  const cwd = join(base, "repo ");
  const sub = join(base, "repo");
  mkdirSync(join(cwd, "src"), { recursive: true });
  git(cwd, "init", "-q", "-b", "main");
  writeFileSync(
    join(cwd, "src", "Ledger.ts"),
    "export function ledgerTotal() { return 1; }\n",
  );
  git(cwd, "add", ".");
  git(cwd, "commit", "-q", "-m", "base");
  plantGitDir(sub, ".");

  return { cwd, sub, marker: join(base, "marker.txt") };
}
