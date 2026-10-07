#!/usr/bin/env node
// @ts-check
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * @typedef {{ file_path?: unknown; command?: unknown } | null | undefined} ToolInput
 * @typedef {{ tool_name?: unknown; tool_input?: ToolInput; cwd?: unknown }} HookInput
 * @typedef {{ hookSpecificOutput: { hookEventName: "PreToolUse"; permissionDecision: "deny"; permissionDecisionReason: string } }} Decision
 */

export const REASON =
  "This .output file is a symlink to a background subagent's JSONL transcript under " +
  "~/.claude, not its report, and touching it stops the session on a permission prompt. " +
  "The report is the text of the subagent's completion notification. To keep it on " +
  "disk, write that text to the scratchpad with the Write tool.";

const SEPARATORS = /[\s'"`<>|;&()]+/;

/**
 * @param {unknown} toolName
 * @param {ToolInput} toolInput
 * @returns {string[]}
 */
export function getCandidatePaths(toolName, toolInput) {
  if (toolName === "Read") {
    return typeof toolInput?.file_path === "string" &&
      toolInput.file_path.endsWith(".output")
      ? [toolInput.file_path]
      : [];
  }

  if (toolName === "Bash") {
    return typeof toolInput?.command === "string"
      ? toolInput.command
          .split(SEPARATORS)
          .filter((token) => token.endsWith(".output"))
      : [];
  }

  return [];
}

/**
 * @param {string} path
 */
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// See review/README.md, "The task-output hook".
/**
 * @param {HookInput | null | undefined} input
 * @returns {Decision | null}
 */
export function getDecision(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const paths = getCandidatePaths(input?.tool_name, input?.tool_input).map(
    (path) => resolve(cwd, path),
  );

  if (!paths.some(isSymlink)) {
    return null;
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: REASON,
    },
  };
}

function main() {
  let input;

  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }

  const decision = getDecision(input);

  if (decision) {
    process.stdout.write(JSON.stringify(decision));
  }
}

if (
  import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? "")).href
) {
  main();
}
