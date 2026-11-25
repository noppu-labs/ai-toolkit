import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { git } from "./investigate-git.ts";

// realpath: on macOS tmpdir is a symlink, and git prints real paths.
export function makeTempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

/** True when this machine's temporary directory ignores letter case. */
export function isCaseInsensitiveTmp(): boolean {
  const dir = makeTempDir("investigate-case-");
  writeFileSync(join(dir, "probe"), "");

  return existsSync(join(dir, "PROBE"));
}

/** True when this machine's temporary directory finds an entry named `stored` under the name `asked`. */
export function tmpFolds(stored: string, asked: string): boolean {
  const dir = makeTempDir("investigate-fold-");
  writeFileSync(join(dir, stored), "");

  return existsSync(join(dir, asked));
}

/** Writes each file, given as { relative path: content }, without committing. */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}

/**
 * A committed repository holding src/formatDate.ts, with node_modules ignored,
 * at `root` or in a new temporary directory.
 */
export function makeTsRepo(
  root: string = makeTempDir("investigate-ts-"),
): string {
  writeFiles(root, {
    "src/formatDate.ts": "export function formatDate() {}\n",
    ".gitignore": "node_modules/\n",
  });
  git(root, "init", "-q", "-b", "main");
  git(root, "add", ".");
  git(root, "commit", "-qm", "base");

  return root;
}

/** Writes and commits each file, ignored or not. */
export function commitFiles(root: string, files: Record<string, string>): void {
  writeFiles(root, files);
  git(root, "add", "-f", "--", ...Object.keys(files));
  git(root, "commit", "-qm", "files");
}

/** Makes `rel` a link to `target` and commits the link. */
export function commitLink(root: string, rel: string, target: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  symlinkSync(target, join(root, rel));
  git(root, "add", "-f", "--", rel);
  git(root, "commit", "-qm", "link");
}

/** Adds the committed repository `sub` at `rel` as a submodule. */
export function commitSubmodule(root: string, rel: string, sub: string): void {
  git(
    root,
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "-q",
    sub,
    rel,
  );
  git(root, "commit", "-qm", "submodule");
}
