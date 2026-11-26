import { findExecutable } from "../exec.mjs";
import { makeGit } from "../git.mjs";

export class Refusal extends Error {
  constructor(reason, detail, extra = {}) {
    super(detail);
    this.reason = reason;
    this.extra = extra;
  }
}

export function refuse(reason, detail, extra) {
  throw new Refusal(reason, detail, extra);
}

export function makeContext() {
  const gitPath = findExecutable("git");

  if (gitPath === null) {
    refuse("no-git", "git not found on PATH");
  }

  const probe = makeGit(gitPath, process.cwd()).run([
    "rev-parse",
    "--show-toplevel",
  ]);

  if (probe.status !== 0) {
    refuse("not-a-repository", probe.stderr.trim());
  }

  const top = probe.stdout.trim();
  const git = makeGit(gitPath, top);
  const gitDir = git.text(["rev-parse", "--absolute-git-dir"]).trim();

  // Calls that change the tree run in the session's own directory, so git keeps
  // it when the head removes it.
  const session = makeGit(gitPath, process.cwd());

  return { gitPath, git, session, top, gitDir };
}
