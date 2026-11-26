import { REF_ARG } from "./constants.mjs";

export function resolveCommit(git, arg) {
  if (!REF_ARG.test(arg)) {
    return null;
  }

  try {
    const sha = git.text([
      "rev-parse",
      "--verify",
      "--quiet",
      `${arg}^{commit}`,
    ]);

    return /^[0-9a-f]{40}$/.test(sha.trim()) ? sha.trim() : null;
  } catch {
    return null;
  }
}
