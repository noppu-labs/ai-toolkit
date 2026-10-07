#!/usr/bin/env node
import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REASON =
  "This .output file is a symlink to a background subagent's JSONL transcript under " +
  "~/.claude, not its report, and touching it stops the session on a permission prompt. " +
  "The report is the text of the subagent's completion notification. To keep it on " +
  "disk, write that text to the scratchpad with the Write tool.";

const OUTPUT_TOKEN = /[^\s'"`<>|;&()]+\.output(?![\w.-])/g;

export function getCandidatePaths(toolName, toolInput) {
  if (toolName === "Read") {
    return typeof toolInput?.file_path === "string"
      ? [toolInput.file_path]
      : [];
  }

  if (toolName === "Bash") {
    return typeof toolInput?.command === "string"
      ? (toolInput.command.match(OUTPUT_TOKEN) ?? [])
      : [];
  }

  return [];
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// Background Bash tasks write plain .output files, which stay readable; only
// the symlinked ones a background subagent leaves behind are denied.
export function getDecision(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const paths = getCandidatePaths(input?.tool_name, input?.tool_input)
    .filter((path) => path.endsWith(".output"))
    .map((path) => resolve(cwd, path));

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
