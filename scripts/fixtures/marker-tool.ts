import { join } from "node:path";
import { resolveExecutable } from "../resolve-executable.ts";
import { makeFakeGitPath, makeFakeToolPath } from "./no-tools-path.ts";

export const MARKER_TOOL = "marker-tool";
const FAKE_MARKER: string = join(import.meta.dirname, "fake-marker.mjs");

// NO_TOOLS_PATH plus a harmless stand-in for a command a hostile name asks for:
// it writes the file FAKE_MARKER_FILE names and does nothing else.
export const FAKE_MARKER_PATH: string = makeFakeToolPath(
  MARKER_TOOL,
  FAKE_MARKER,
);

const FAKE_GIT: string = join(import.meta.dirname, "fake-git-unset.mjs");

/**
 * An env whose `git` ignores safe.bareRepository, which is what a git older
 * than 2.38 does with it, beside the marker tool and any `fakes` given as
 * { name: fakeScript }. Spread it into the env of a run.
 */
export function makeUnsetGitEnv(fakes: Record<string, string> = {}): {
  PATH: string;
  FAKE_GIT_REAL: string;
} {
  return {
    PATH: makeFakeGitPath(FAKE_GIT, { ...fakes, [MARKER_TOOL]: FAKE_MARKER }),
    FAKE_GIT_REAL: resolveExecutable("git"),
  };
}

export const UNSET_GIT_ENV: { PATH: string; FAKE_GIT_REAL: string } =
  makeUnsetGitEnv();

// A name git grep reads as an option that runs a command, unless the caller
// marks it as the pattern.
export const MARKER_OPTION_NAME = `--open-files-in-pager=${MARKER_TOOL}`;
