export const meta = {
  name: "pr-review-stages",
  description:
    "Structural brief, three review stages, and consolidation for every PR that review:pr-review resolves",
  phases: [
    { title: "Brief", detail: "one structural brief per PR" },
    {
      title: "Stages",
      detail: "correctness, type safety, and comments per PR, in parallel",
    },
    {
      title: "Consolidate",
      detail: "labels, cross-references, and the roll-up in plain JavaScript, no agents",
    },
  ],
};

// The four templates below are copied from review/skills/pr-review/SKILL.md:
// the body of "## Step 2: structural brief" and the three fenced stage
// prompts of step 3. scripts/review-workflow.test.ts fails when they drift.

const STEP2_TEMPLATE = `One brief per PR, plain text, pasted whole into every subagent prompt for that PR.

If the \`investigate:brief\` skill is available (the \`investigate\` plugin from this marketplace), invoke the \`investigate:brief\` skill to get its script path under \`\${CLAUDE_PLUGIN_ROOT}\`, and build the brief from the script's output plus part of the lighter brief below. Paste the outputs concatenated as the brief.

1. Run the script in a checkout at \`<HEAD>\`, since it reads the working tree. When the current checkout is already there and clean (\`git rev-parse HEAD\` equals \`git rev-parse <HEAD>\` and \`git status --porcelain\` prints nothing), run it in place: that checkout has its \`node_modules\` or \`vendor\` and its gitnexus registration, so the brief is richer. Otherwise create a worktree named after the PR in a scratch directory outside the repository, \`git worktree add <scratch>/pr-review-<number> <HEAD>\`, and remove it afterwards with \`git worktree remove <scratch>/pr-review-<number>\`. A fresh worktree has no \`node_modules\` or \`vendor\`, so language-server types and callers degrade, and its directory name does not match the gitnexus registry, so the Tools line reads \`gitnexus: unavailable (...)\` and graph sections are omitted.
2. Pick the targets from the changed source files: PHP, or JS/TS including \`.mjs\`, \`.cjs\`, \`.mts\`, \`.cts\`, and not named \`*.test.*\`, \`*.spec.*\`, or \`*.stories.*\`, which the script leaves out. Take the directory of each, then drop every directory that is an ancestor of another on the list. A dropped directory's own changed source files, and changed source files at the repo root, are targeted one file at a time instead of by directory, so \`.\` is never a target. Directories with no changed sources (manifests, docs, workflows) get no run.
3. Run the script once per target, always with \`--no-docs\`: a review needs no doc verdicts, and the flag keeps package names from being sent to context7.com. A run that still exits non-zero (a deleted directory, no sources) gets no per-directory fallback; item 4 covers its files.
4. Run the lighter brief's first three commands as well and keep their output, the stat block and the changed-symbol list, next to the script's output. The script details at most 15 symbols per directory, taken in file path order, so the symbol list is what shows the changes it dropped. Run the fourth command for each changed symbol that has no section in the script's output.

When the script's output lists no symbols and \`git diff --stat\` shows most of the changed lines are in \`.py\` files, build the brief from the commands below instead, and record under \`## Not available in this run\` that the structural brief came from the fallback commands.

If it is not, build a lighter one from these commands:

\`\`\`sh
git diff --stat <BASE>...<HEAD>
git diff -U0 <BASE>...<HEAD> | grep -E '^@@'
git diff <BASE>...<HEAD> | grep -E '^\\+(export )?(async )?(function|class|const|interface|type) |^\\+[[:space:]]*(public|protected|private) function'
git diff <BASE>...<HEAD> -- '*.py' | grep -E '^\\+[[:space:]]*(async )?def [A-Za-z_]|^\\+[[:space:]]*class [A-Za-z_]'
git grep -nw <symbol> <HEAD>
\`\`\`

\`<BASE>\` and \`<HEAD>\` are the two refs resolved in step 1, the same slots step 3 fills.

The first gives the shape of the change. The next three give the added or changed functions, classes, and methods, from the hunk headers and from the added lines. The last runs once per changed symbol and gives its callers on the head ref, which is what tells a stage whether a signature change has call sites the PR missed.

Every anchor in the third and fourth commands carries a \`+\`, so it matches added lines and not the context lines around them. Dropping the \`+\` inverts the result: every unchanged declaration in the hunk matches and every added one does not, and the per-symbol \`git grep\` then has nothing to run on.

The fourth command is for Python. A Python method is indented under its class, so its anchors allow leading whitespace before \`def\` and \`class\`. It reads only \`*.py\` files, as a separate command, because those indented anchors otherwise match markdown prose and nested TypeScript classes. For a Python symbol, run the caller command as \`git grep -nw <symbol> <HEAD> -- '*.py'\`. The word match finds a call, a decorator argument, and a reference passed as a value, such as \`Depends(get_db)\` or \`callbacks=[handler]\`, and the pathspec keeps a same-named symbol in another language out of the list. Search for the bare name, never a dotted module path: a Python project without a package layout imports a sibling module by bare name and may load a hyphenated script file by path.

An empty caller list for a Python symbol is not evidence of dead code when the symbol is a function a decorator registers (a web route, a CLI command, a pytest fixture), a method a framework calls by name (a pydantic validator, a \`__dunder__\` method), or a module imported for what it does at import time. None of them has a textual caller. List such a symbol in the brief as \`callers unresolved\`, not with an empty caller list.

Three dots, so only what the branch adds is in scope.

The commands run here produce the brief. Their output goes into the brief, not into a reading pass by the orchestrator. Keep each brief to roughly a page: the stat block, the symbol list, and the caller list.`;

const CORRECTNESS_TEMPLATE = `Review PR "<PR_TITLE>" (<PR_URL>) for correctness. Base ref <BASE>, head ref <HEAD>.
Only what the branch adds is in scope: git diff <BASE>...<HEAD>, three dots.

Structural brief:
<BRIEF>

Review by hand: read the diff and the changed files, and look for behaviour changes,
error handling, boundary conditions, and missing tests. Validate any claim you can by
running the project's tests or linters; record what you ran.

For a Python project, run \`pytest\`, \`ruff check\`, and the configured type checker
(mypy, pyright, pyrefly, or ty), resolving each command the way step 0 of
\`review:comment-audit\` does. When pytest runs with \`filterwarnings = ["error"]\`, a
new deprecation warning fails the suite, so a passing run is also evidence that the
branch adds no warning. Look in particular for a mutable default argument; a bare
\`except:\` or an \`except Exception: pass\`; a coroutine called without \`await\`; \`is\`
compared with a literal; a collection mutated inside the loop that iterates it; a
\`datetime.now()\` without a timezone where the stored value has one; an f-string or
\`%\` interpolation inside a SQL or shell call; blocking I/O inside an \`async def\`
that belongs in \`asyncio.to_thread\` or an async client; and a module-level
environment read that raises at import time and so leaves the module untestable.
These are leads, not rules: each finding still ends with its outcome.

End every finding with its outcome, one of: crash, wrong data shown, wrong data
persisted, harmless, question. Harmless means no crash, no wrong data shown or
persisted, and an effect that clears on retry or reload. Question means the diff
could not settle the claim and you are asking the author. The outcome separates a
bug from a harmless edge case or a question, and a finding without one is graded as
a bug. A finding about structure rather than behaviour (dead code, duplication,
layering, a convention) ends with harmless.

Skills that run in a background subagent, \`code-review\` among them, deliver their
result to the session that spawned you, not to you. The orchestrator runs
\`code-review\` itself as a separate pass, so your findings are your own reading of
the diff.

Return exactly these three sections and nothing else:

## Findings
One entry per finding, each starting with \`path:line\` on the HEAD side, then the
claim in one or two sentences, then the outcome. No finding without a \`path:line\`.

## Validated
Every check you ran, with the command and its result.

## Skipped
Every skill, tool, or check you could not use, with the reason.`;

const TYPE_SAFETY_TEMPLATE = `Review PR "<PR_TITLE>" (<PR_URL>) for type safety. Base ref <BASE>, head ref <HEAD>.

Structural brief:
<BRIEF>

Invoke \`review:type-safety-review base=<BASE> head=<HEAD>\`. That skill returns its
report as its response and writes no file. Relay its findings in the shape below,
keeping each finding's rule id (\`PHP-1\` to \`PHP-5\`, \`TS-1\` to \`TS-4\`, \`PY-1\` to
\`PY-5\`), its verbatim quote, and its proposed shape.

That skill inherits comment-audit's \`base=\`/\`head=\` detection and its ask. Both are
already given above, so if it asks for anything else, you have no one to ask: record
the miss under \`## Skipped\` and carry on with the rest of the review rather than
stopping.

Return exactly these three sections and nothing else:

## Findings
One entry per finding, each starting with \`path:line\` on the HEAD side, then the
rule id, the quote, the reason, and the proposed shape.

## Validated
Every check you ran, with the command and its result.

## Skipped
Every skill, tool, or check you could not use, with the reason. Include the paths
the skill reported as skipped for being generated or vendored.`;

const COMMENTS_TEMPLATE = `Review PR "<PR_TITLE>" (<PR_URL>) for comments and documentation. Base ref <BASE>,
head ref <HEAD>.

Structural brief:
<BRIEF>

Invoke \`review:comment-audit base=<BASE> head=<HEAD>\` in report mode. Never pass
\`--apply\`: this run reports and changes nothing. That skill writes its report to a
file. Read that file and return its summary and findings in the shape below.

That skill's step 0 asks for \`readme=\` when a MOVE verdict needs one, and for a
\`base=\` it cannot resolve. You have no one to ask. Both are already given above
except \`readme=\`, so if it asks for that, record the miss under \`## Skipped\`, take
the proposed text it writes without a path, and carry on with the rest of the
audit rather than stopping.

Return exactly these three sections and nothing else:

## Findings
The audit report lists findings as \`**L123, VERDICT**\` under a \`### path\` heading;
prefix each one you relay with the path from its file heading, so it reads
\`path:line\`. One entry per finding, each starting with \`path:line\` on the HEAD side,
then the verdict (DELETE, TRIM, MOVE, KEEP, UNSURE, WRONG), the verbatim comment,
and the rewrite or pointer where the verdict has one. For a DELETE or TRIM, also give
the comment's first and last HEAD line as \`L<start>-L<end>\`: the start is the audit's
\`L123\`, and the end is the start plus the comment's line count at HEAD minus one, so
a three-line comment at \`L123\` is \`L123-L125\` and the span the rewrite replaces is
explicit. KEEP verdicts may be one line each.

## Validated
Every check you ran, with the command and its result. Include the report file path
and the comment line count the audit opened with.

## Skipped
Every skill, tool, or check you could not use, with the reason.`;

const BRIEF_TRAILER = `Return the brief through the structured output, not as text: the whole brief as \`brief\`; \`source\` set to \`investigate\` when the brief was built from the \`investigate:brief\` script's output and to \`fallback\` when it came only from the lighter brief's commands; and under \`skipped\` every skill, tool, or check you could not use, each with the \`tool\` it names and the \`reason\`, or an empty list. Anything the instructions above say to record under \`## Not available in this run\`, such as a brief built from the fallback commands after the script's output listed no symbols, also goes under \`skipped\`, with the \`tool\` it concerns and the \`reason\`.`;

const STAGE_TRAILER = `Return the three sections through the structured output, not as text: each \`## Findings\` entry as one \`findings\` item, with its \`path\` and \`line\` on the HEAD side and the rest of the entry as \`text\`; each \`## Validated\` line as one \`validated\` item; and each \`## Skipped\` entry as one \`skipped\` item, with the \`tool\` it names and the \`reason\`. \`text\` is the entry without its leading \`path:line\`.`;

const SKIPPED_ITEMS = {
  type: "array",
  items: {
    type: "object",
    properties: { tool: { type: "string" }, reason: { type: "string" } },
    required: ["tool", "reason"],
  },
};

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    brief: { type: "string" },
    source: { type: "string", enum: ["investigate", "fallback"] },
    skipped: SKIPPED_ITEMS,
  },
  required: ["brief", "source", "skipped"],
};

const STAGE_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          path: { type: "string" },
          line: { type: "integer", minimum: 1 },
          text: { type: "string" },
        },
        required: ["path", "line", "text"],
      },
    },
    validated: { type: "array", items: { type: "string" } },
    skipped: SKIPPED_ITEMS,
  },
  required: ["findings", "validated", "skipped"],
};

const STAGES = [
  { key: "correctness", name: "correctness", heading: "### Correctness", template: CORRECTNESS_TEMPLATE },
  { key: "typeSafety", name: "type safety", heading: "### Type safety", template: TYPE_SAFETY_TEMPLATE },
  { key: "comments", name: "comments", heading: "### Comments", template: COMMENTS_TEMPLATE },
];

const PASS_LABEL = "hand review only";

// One pass over the template, so a slot value that itself contains a slot
// token (a brief quoting `git diff <BASE>...<HEAD>`, a title) is left alone.
function fill(template, slots) {
  return template.replace(/<(BRIEF|BASE|HEAD|PR_TITLE|PR_URL)>/g, (token, slot) =>
    slot in slots ? slots[slot] : token,
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

const INSTRUCTION_KEYS = ["brief", ...STAGES.map((stage) => stage.key), "all"];

const INSTRUCTIONS_HEADING = "## Additional instructions from the caller";

function validateInstructions(value, at) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${at} must be an object with any of ${INSTRUCTION_KEYS.join(", ")}`);
  }
  const instructions = {};
  for (const key of Object.keys(value)) {
    if (!INSTRUCTION_KEYS.includes(key)) {
      throw new Error(`${at}.${key} is not a known key; the keys are ${INSTRUCTION_KEYS.join(", ")}`);
    }
    if (!isNonEmptyString(value[key])) {
      throw new Error(`${at}.${key} must be a non-empty string`);
    }
    instructions[key] = value[key].trim();
  }
  return instructions;
}

function validatePr(item, index) {
  const at = `args[${index}]`;
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`${at} must be an object with number, title, base, head, and url`);
  }
  if (!Number.isInteger(item.number) || item.number < 1) {
    throw new Error(`${at}.number must be a positive integer`);
  }
  for (const field of ["title", "base", "head", "url"]) {
    if (!isNonEmptyString(item[field])) {
      throw new Error(`${at}.${field} must be a non-empty string`);
    }
  }
  const instructions = validateInstructions(item.instructions, `${at}.instructions`);
  return { number: item.number, title: item.title, base: item.base, head: item.head, url: item.url, instructions };
}

function validateArgs(input) {
  if (typeof input === "string") {
    throw new Error("args arrived as a string; pass the PR list as a JSON array value, not a JSON-encoded string");
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("args must be a non-empty array of PRs in merge order: [{ number, title, base, head, url, instructions? }, ...]");
  }
  const prs = input.map(validatePr);
  const numbers = new Set();
  for (const pr of prs) {
    if (numbers.has(pr.number)) {
      throw new Error(`args lists PR ${pr.number} twice; each PR of a stack appears once, in merge order`);
    }
    numbers.add(pr.number);
  }
  return prs;
}

// Ends in its own blank line, so an empty block leaves the template, a blank
// line, then the trailer.
function instructionsBlock(pr, key) {
  const parts = [];
  if (pr.instructions) {
    for (const name of ["all", key]) {
      if (pr.instructions[name] !== undefined) {
        parts.push(pr.instructions[name]);
      }
    }
  }
  return parts.length === 0 ? "" : `${INSTRUCTIONS_HEADING}\n\n${parts.join("\n\n")}\n\n`;
}

function briefPrompt(pr) {
  const header = `Build the structural brief for PR #${pr.number} "${pr.title}" (${pr.url}). Base ref ${pr.base}, head ref ${pr.head}. Only what the branch adds is in scope: git diff ${pr.base}...${pr.head}, three dots. Do not review the change; the brief is the input every reviewer of this PR gets.`;
  const body = fill(STEP2_TEMPLATE, { BASE: pr.base, HEAD: pr.head });
  return `${header}\n\n${body}\n\n${instructionsBlock(pr, "brief")}${BRIEF_TRAILER}`;
}

function stagePrompt(stage, pr, brief) {
  const body = fill(stage.template, {
    BRIEF: brief,
    BASE: pr.base,
    HEAD: pr.head,
    PR_TITLE: pr.title,
    PR_URL: pr.url,
  });
  return `${body}\n\n${instructionsBlock(pr, stage.key)}${STAGE_TRAILER}`;
}

async function runBrief(pr) {
  let output = null;
  try {
    output = await agent(briefPrompt(pr), {
      label: `brief:${pr.number}`,
      phase: "Brief",
      schema: BRIEF_SCHEMA,
    });
  } catch (error) {
    // Schema retries exhausted or the budget ceiling: the stages still run,
    // without a brief, and the roll-up records the gap.
    log(`PR ${pr.number}: brief agent failed (${error instanceof Error ? error.message : String(error)})`);
  }
  log(`PR ${pr.number}: brief ${output ? `ready (${output.source})` : "missing"}`);
  return { brief: output };
}

async function runStages({ brief }, pr) {
  const text = brief ? brief.brief.trim() : "";
  const outputs = await parallel(
    STAGES.map((stage) => () =>
      agent(stagePrompt(stage, pr, text), {
        label: `${stage.key}:${pr.number}`,
        phase: "Stages",
        schema: STAGE_SCHEMA,
      }),
    ),
  );
  return { brief, outputs };
}

function anchorOf(finding) {
  return `${finding.path}:${finding.line}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A stage that followed the template literally starts `text` with the anchor
// the schema already carries. Only the exact anchor is stripped: `a.php:10`
// is not a prefix of `a.php:100`.
function stripAnchor(text, anchor) {
  const lead = new RegExp(`^\`?${escapeRegExp(anchor)}\`?(?![0-9]|[-:][0-9])[\\s,:;-]*`);
  return text.replace(lead, "");
}

// A multi-line finding (a proposed shape, a quoted block) stays one list
// item: every line after the first is indented under the anchor.
function entryText(finding) {
  const text = stripAnchor(finding.text.trim(), anchorOf(finding));
  return text.split("\n").join("\n  ");
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${anchorOf(finding)}\n${entryText(finding)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readStage(stage, output) {
  if (!output) {
    return { stage, reported: false, findings: [], skipped: [] };
  }
  return { stage, reported: true, findings: dedupe(output.findings), skipped: output.skipped };
}

// Every finding stays under the stage that reported it, with its own label,
// so the labels downstream come from the right category. An anchor another
// stage also reported is cross-referenced instead of merged: two claims at one
// line are not always one finding, and the merge judgement belongs to the
// reader of the report.
function stagesAt(results, anchor, except) {
  return results
    .filter((result) => result.stage !== except)
    .filter((result) => result.findings.some((finding) => anchorOf(finding) === anchor))
    .map((result) => result.stage.name);
}

function labelsOf(result, results, finding) {
  const labels = [];
  if (result.stage.key === "correctness") {
    labels.push(PASS_LABEL);
  }
  const others = stagesAt(results, anchorOf(finding), result.stage);
  if (others.length > 0) {
    labels.push(`also reported by ${others.join(" and ")}`);
  }
  return labels.length === 0 ? "" : ` (${labels.join("; ")})`;
}

function renderStage(result, results) {
  const lines = [result.stage.heading];
  if (!result.reported) {
    lines.push("The stage did not report.");
    return lines;
  }
  if (result.findings.length === 0) {
    lines.push("No findings.");
    return lines;
  }
  for (const finding of result.findings) {
    const text = entryText(finding);
    const labels = labelsOf(result, results, finding);
    // A label after a closing code fence would stop the fence from closing,
    // so a multi-line entry carries its label on its own indented line.
    const tail = text.includes("\n") && labels !== "" ? `\n ${labels}` : labels;
    lines.push(`- \`${anchorOf(finding)}\` ${text}${tail}`);
  }
  return lines;
}

function renderPr(pr, item) {
  const lines = [`## ${pr.number} ${pr.title}`, pr.url, ""];
  if (!item) {
    for (const stage of STAGES) {
      lines.push(stage.heading, "The stage did not report.", "");
    }
    lines.pop();
    return lines;
  }
  const results = STAGES.map((stage, index) => readStage(stage, item.outputs[index]));
  for (const result of results) {
    lines.push(...renderStage(result, results), "");
  }
  lines.pop();
  return lines;
}

function collectMisses(pr, item) {
  const misses = { tools: [], lines: [] };
  if (!item) {
    misses.lines.push(`PR ${pr.number}: the pipeline stopped before consolidation, so no stage reported`);
    return misses;
  }
  if (item.brief) {
    for (const skip of item.brief.skipped) {
      misses.tools.push({ ...skip, wantedBy: `structural brief (PR ${pr.number})` });
    }
  }
  if (!item.brief || item.brief.brief.trim() === "") {
    misses.lines.push(`structural brief for PR ${pr.number}: the brief subagent returned nothing, so the stages ran without one`);
  }
  STAGES.forEach((stage, index) => {
    const output = item.outputs[index];
    if (!output) {
      misses.lines.push(`${stage.name} stage for PR ${pr.number}: no report returned`);
      return;
    }
    for (const skip of output.skipped) {
      misses.tools.push({ ...skip, wantedBy: `${stage.name} (PR ${pr.number})` });
    }
  });
  return misses;
}

function renderNotAvailable(prs, items) {
  const groups = new Map();
  const lines = [];
  prs.forEach((pr, index) => {
    const misses = collectMisses(pr, items[index]);
    lines.push(...misses.lines);
    for (const miss of misses.tools) {
      const tool = miss.tool.trim() === "" ? "unnamed tool" : miss.tool.trim();
      const key = tool.toLowerCase();
      const group = groups.get(key) ?? { tool, wantedBy: [], reasons: [] };
      if (!group.wantedBy.includes(miss.wantedBy)) {
        group.wantedBy.push(miss.wantedBy);
      }
      const reason = miss.reason.trim().split("\n").join("\n  ");
      if (reason !== "" && !group.reasons.includes(reason)) {
        group.reasons.push(reason);
      }
      groups.set(key, group);
    }
  });
  const toolLines = [...groups.values()].map((group) => {
    const reasons = group.reasons.length === 0 ? "" : ` ${group.reasons.join("; ")}`;
    return `- \`${group.tool}\`: wanted by ${group.wantedBy.join(", ")}.${reasons}`;
  });
  const all = [...toolLines, ...lines.map((line) => `- ${line}`)];
  return all.length === 0 ? ["Every stage had everything it needed."] : all;
}

function renderReport(prs, items) {
  const lines = [`# Review: ${prs.map((pr) => pr.number).join(", ")}`, ""];
  prs.forEach((pr, index) => {
    lines.push(...renderPr(pr, items[index]), "");
  });
  lines.push("## Not available in this run", ...renderNotAvailable(prs, items));
  return `${lines.join("\n")}\n`;
}

function countFindings(prs, items) {
  return prs.map((pr, index) => {
    const item = items[index];
    const counts = { number: pr.number };
    STAGES.forEach((stage, stageIndex) => {
      const output = item ? item.outputs[stageIndex] : null;
      counts[stage.key] = output ? dedupe(output.findings).length : null;
    });
    return counts;
  });
}

const prs = validateArgs(args);
log(`Reviewing ${prs.length} PR${prs.length === 1 ? "" : "s"}: ${prs.map((pr) => pr.number).join(", ")}`);
const items = await pipeline(prs, runBrief, runStages);
phase("Consolidate");
const report = renderReport(prs, items);
log(`Report ready: ${report.length} characters`);
return { report, counts: countFindings(prs, items) };
