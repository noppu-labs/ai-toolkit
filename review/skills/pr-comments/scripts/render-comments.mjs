#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LABELS = {
  correctness: [
    "Bug",
    "Error handling",
    "Missing test",
    "Performance",
    "Security",
    "Separation of concerns",
    "Validation",
  ],
  typeSafety: [
    "Duplicate type",
    "Missing sanity check",
    "Mixed on a boundary",
    "Pseudo-type",
    "Unchecked cast",
    "Unstructured array",
  ],
  comments: ["Delete", "Move", "Trim", "Unsure", "Wrong"],
};

const PREFIXES = {
  correctness: "COR",
  typeSafety: "TPS",
  comments: "DOC",
};

// Severity is a property of the label, not a judgement call, so every label
// across every category has one emoji and the labels never collide.
const EMOJI = {
  Bug: "🔴",
  "Error handling": "🟠",
  "Missing test": "🟠",
  Performance: "🟠",
  Security: "🔴",
  "Separation of concerns": "🟠",
  Validation: "🟠",
  "Duplicate type": "🟡",
  "Missing sanity check": "🟡",
  "Mixed on a boundary": "🟠",
  "Pseudo-type": "🟡",
  "Unchecked cast": "🟠",
  "Unstructured array": "🟠",
  Delete: "🟡",
  Move: "🟡",
  Trim: "🟡",
  Unsure: "⚪",
  Wrong: "🔴",
};

// Vocabulary a model leaks from the stage reports into the head of a body:
// its own header, a rule id, an audit verdict, or the pass that found it.
const SCRUB_PATTERNS = [
  /^\p{Extended_Pictographic}\s+\*\*\[[^\]\n]*\]\s*[^*\n]*\*\*\s*/u,
  /^\*\*[^*\n]*,\s*(?:PHP|TS)-\d\*\*:?\s*/u,
  /^\*\*(?:PHP|TS)-\d\*\*:?\s*/u,
  /^(?:PHP|TS)-\d:\s*/u,
  /^\((?:PHP|TS)-\d\)\s*/u,
  /^\*\*(?:DELETE|MOVE|TRIM|UNSURE|WRONG)\*\*:?\s*/u,
  /^(?:DELETE|MOVE|TRIM|UNSURE|WRONG):\s*/u,
  /^\[(?:both passes|code-review only|hand review only)\]\s*/u,
  /^(?:both passes|code-review only|hand review only):\s*/u,
];

const USAGE = "usage: render-comments.mjs [--format json|markdown]";

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function stripOnce(body) {
  let text = body;

  for (const pattern of SCRUB_PATTERNS) {
    text = text.replace(pattern, "");
  }

  return text;
}

/**
 * Removes leaked reviewer vocabulary from the start of a body. Runs the
 * patterns to a fixed point so a body carrying two of them scrubs the same as
 * one carrying either: every pattern consumes at least one character, so the
 * loop always terminates.
 */
export function scrubBody(body) {
  let text = body;
  let previous = null;

  while (text !== previous) {
    previous = text;
    text = stripOnce(text);
  }

  return text.trimStart();
}

function findFieldProblems(comment) {
  const problems = [];

  if (!isNonEmptyString(comment.path)) {
    problems.push("path must be a non-empty string");
  }

  if (!Number.isInteger(comment.line) || comment.line < 1) {
    problems.push("line must be an integer of at least 1");
  }

  if (typeof comment.body !== "string" || comment.body.trim() === "") {
    problems.push("body must be a non-empty string");
  }

  return problems;
}

function findLabelProblems(comment) {
  const labels = Object.hasOwn(PREFIXES, comment.category)
    ? LABELS[comment.category]
    : null;

  if (labels === null) {
    return [`category must be one of ${Object.keys(LABELS).join(", ")}`];
  }

  if (!labels.includes(comment.label)) {
    return [
      `label ${JSON.stringify(comment.label)} is not one of ${comment.category}: ${labels.join(", ")}`,
    ];
  }

  return [];
}

function findProblems(comment, index) {
  const name = `comments[${index}]`;

  if (comment === null || typeof comment !== "object") {
    return [`${name}: must be an object`];
  }

  const problems = [
    ...findFieldProblems(comment),
    ...findLabelProblems(comment),
  ];

  return problems.map((problem) => `${name}: ${problem}`);
}

function getComments(input) {
  if (
    input === null ||
    typeof input !== "object" ||
    !Array.isArray(input.comments)
  ) {
    throw new Error("input must be an object with a comments array");
  }

  return input.comments;
}

function makeCode(category, counters) {
  const prefix = PREFIXES[category];
  const next = (counters.get(prefix) ?? 0) + 1;

  counters.set(prefix, next);

  return `${prefix}-${String(next).padStart(2, "0")}`;
}

function renderComment(comment, counters) {
  const code = makeCode(comment.category, counters);
  const header = `${EMOJI[comment.label]} **[${code}] ${comment.label}**`;

  return {
    path: comment.path,
    line: comment.line,
    code,
    category: comment.category,
    label: comment.label,
    // One newline, never a blank one: a blank line ends the markdown list item
    // this body is folded into downstream.
    body: `${header}\n${scrubBody(comment.body)}`,
  };
}

export function renderComments(input) {
  const comments = getComments(input);
  const problems = comments.flatMap(findProblems);

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }

  const counters = new Map();

  return {
    ...input,
    comments: comments.map((comment) => renderComment(comment, counters)),
  };
}

export function formatMarkdown(rendered) {
  const sections = [];

  if (typeof rendered.verdict === "string") {
    sections.push(`Verdict: ${rendered.verdict}`);
  }

  if (isNonEmptyString(rendered.summary)) {
    sections.push(rendered.summary);
  }

  for (const comment of rendered.comments) {
    sections.push(`\`${comment.path}:${comment.line}\`\n${comment.body}`);
  }

  if (isNonEmptyString(rendered.diagnostics)) {
    sections.push(`Diagnostics: ${rendered.diagnostics}`);
  }

  return sections.length === 0 ? "" : `${sections.join("\n\n")}\n`;
}

function parseFormat(args) {
  const index = args.indexOf("--format");

  if (index === -1) {
    return "json";
  }

  const value = args[index + 1];

  return value === "json" || value === "markdown" ? value : null;
}

function fail(message, code) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseInput(text) {
  try {
    return JSON.parse(text);
  } catch {
    return fail("input must be valid JSON", 1);
  }
}

function main(args) {
  const format = parseFormat(args);

  if (format === null) {
    fail(USAGE, 2);
  }

  const input = parseInput(readFileSync(0, "utf8"));

  try {
    const rendered = renderComments(input);

    process.stdout.write(
      format === "markdown"
        ? formatMarkdown(rendered)
        : `${JSON.stringify(rendered, null, 2)}\n`,
    );
  } catch (error) {
    fail(error.message, 1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2));
}
