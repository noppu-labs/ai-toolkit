import { SAFE_GIT } from "./constants.mjs";
import { quoteShell } from "./display.mjs";

export function switchBackArgs(entry, discard = false) {
  const flags = discard ? ["--discard-changes"] : [];

  return entry.branch === null
    ? ["switch", ...flags, "--detach", "--no-overwrite-ignore", entry.fromSha]
    : ["switch", ...flags, "--no-guess", "--no-overwrite-ignore", entry.branch];
}

export function branchExists(ctx, branch) {
  return (
    ctx.git.run(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])
      .status === 0
  );
}

// What a person should run: the plain switch back, or, when the branch is gone,
// the one that makes it again where the check-out started.
function printedArgs(ctx, entry, discard) {
  if (entry.branch === null || branchExists(ctx, entry.branch)) {
    return switchBackArgs(entry, discard);
  }

  return [
    "switch",
    ...(discard ? ["--discard-changes"] : []),
    "--no-overwrite-ignore",
    "-c",
    entry.branch,
    entry.fromSha,
  ];
}

function shellLine(words) {
  return words.map(quoteShell).join(" ");
}

export function switchBackCommand(ctx, entry, discard = false) {
  return shellLine([
    "git",
    ...SAFE_GIT,
    "-C",
    ctx.top,
    ...printedArgs(ctx, entry, discard),
  ]);
}

export function keepCommitsCommand(ctx, entry, sha) {
  const keep = shellLine([
    "git",
    "-C",
    ctx.top,
    "branch",
    "-f",
    `pr-review-kept-${sha.slice(0, 12)}`,
    sha,
  ]);

  return `${keep} && ${switchBackCommand(ctx, entry)}`;
}

export const DISCARD_NOTE =
  "The command discards every change to tracked files made since, the listed ones included, and leaves untracked ones.";

export const FORGET_HINT =
  "; if the entry is not wanted, `head-setup.mjs forget` drops every record (restore the others first)";
