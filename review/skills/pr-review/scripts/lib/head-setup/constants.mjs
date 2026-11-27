export const SHA = /^[0-9a-f]{40}$/;

export const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const RECORD_FILE = "pr-review-setup.json";

export const LOCK_FILE = "pr-review-setup.lock";

export const MARKER_FILE = ".pr-review-marker";

export const SCRATCH_PREFIX = "pr-review-";

export const HEAD_DIR = "head";

export const KINDS = ["checkout", "worktree", "clone"];

export const UNSAFE_BRANCH_CHARS = " ~^:?*[\\";

export const SAFE_GIT = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "submodule.recurse=false",
];

// Which paths count as a change. Before a switch and after one that failed,
// every path does. After a switch that worked, an untracked file can only come
// from a `.gitignore` that differs between the two commits, so only tracked
// changes are damage.
export const ALL_CHANGES = { ignoreSubmodules: false, untracked: true };

export const EVERY_FILE_NO_SUBMODULES = {
  ignoreSubmodules: true,
  untracked: "all",
};

export const ALL_CHANGES_NO_SUBMODULES = {
  ignoreSubmodules: true,
  untracked: true,
};

export const TRACKED_CHANGES = { ignoreSubmodules: true, untracked: false };

export const SESSION_PATHSPECS = [
  ":(icase).claude",
  ":(icase).mcp.json",
  ":(glob,icase)**/.claude",
  ":(glob,icase)**/.claude/**",
  ":(glob,icase)**/.mcp.json",
  ":(glob,icase)**/opencode.json",
  ":(glob,icase)**/opencode.jsonc",
  ":(glob,icase)**/.opencode",
  ":(glob,icase)**/.opencode/**",
  ":(glob,icase)**/CLAUDE.md",
  ":(glob,icase)**/CLAUDE.local.md",
  ":(glob,icase)**/AGENTS.md",
];

export const OPERATION_MARKERS = [
  "MERGE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
  "rebase-merge",
  "rebase-apply",
  "BISECT_LOG",
];

export const DEPENDENCY_NAMES = new Map([
  ["composer", ["vendor"]],
  ["npm", ["node_modules"]],
  ["pnpm", ["node_modules"]],
  ["bun", ["node_modules"]],
  ["yarn", ["node_modules", ".pnp.cjs"]],
  ["uv", [".venv"]],
  ["poetry", [".venv"]],
]);
