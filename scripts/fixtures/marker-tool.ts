import { join } from "node:path";
import { makeFakeToolPath } from "./no-tools-path.ts";

const MARKER_TOOL = "marker-tool";

// NO_TOOLS_PATH plus a harmless stand-in for a command a hostile name asks for:
// it writes the file FAKE_MARKER_FILE names and does nothing else.
export const FAKE_MARKER_PATH: string = makeFakeToolPath(
  MARKER_TOOL,
  join(import.meta.dirname, "fake-marker.mjs"),
);

// A name git grep reads as an option that runs a command, unless the caller
// marks it as the pattern.
export const MARKER_OPTION_NAME = `--open-files-in-pager=${MARKER_TOOL}`;
