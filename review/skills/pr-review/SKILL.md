---
name: pr-review
description: Orchestrate a three-stage review (correctness, type safety, comment audit) of one PR or a stack of PRs, delegating each stage to a subagent with a structural brief and consolidating one report. Use when asked for a comprehensive, full, or three-stage PR review, or to review a PR stack.
---

# PR review orchestrator

Three reviews of the same diff merged into one report: correctness, type safety, comments. Correctness runs as two independent passes, the harness's `code-review` skill invoked by the orchestrator and a stage subagent reviewing by hand. The orchestrator resolves the refs, builds a structural brief, dispatches everything, and consolidates what comes back. On Claude Code with workflows enabled, the brief, the stage dispatch, and the consolidation run as the plugin workflow `review:pr-review-stages` (the workflow path in step 3); elsewhere the orchestrator does them by hand.

The orchestrator keeps its context lean. It reads briefs and subagent reports and nothing else. It never opens a diff, a changed file, or a `git show`, however small the PR looks. Everything that needs the diff happens inside a subagent.

## Input

```text
/review:pr-review <pr> [<pr> ...]
```

One PR number, or several forming a stack in merge order. Everything else is resolved from `gh`.

## Step 1: resolve the stack

For each PR number:

```sh
gh pr view <n> --json number,title,baseRefName,headRefName,url
```

Each PR is reviewed against its own `baseRefName`, never against the trunk. In a stack, PR two's base is PR one's head branch, so reviewing it against `main` would re-review PR one's diff.

Fetch both refs so the diff resolves in this clone:

```sh
git fetch origin <baseRefName> <headRefName>
```

The base and head passed to every stage are then `origin/<baseRefName>` and `origin/<headRefName>`.

State the resolved pairs before starting, one line per PR: number, title, base, head, url. If `gh` is unavailable, or a number does not resolve to a PR, stop and say which number failed. Do not guess a base ref.

## Step 2: structural brief

One brief per PR, plain text, pasted whole into every subagent prompt for that PR.

If the `investigate:brief` skill is available (the `investigate` plugin from this marketplace), invoke the `investigate:brief` skill to get its script path under `${CLAUDE_PLUGIN_ROOT}`, and build the brief from the script's output plus part of the lighter brief below. Paste the outputs concatenated as the brief.

1. Run the script in a checkout at `<HEAD>`, since it reads the working tree. When the current checkout is already there and clean (`git rev-parse HEAD` equals `git rev-parse origin/<headRefName>` and `git status --porcelain` prints nothing), run it in place: that checkout has its `node_modules` or `vendor` and its gitnexus registration, so the brief is richer. Otherwise create a worktree named after the PR in a scratch directory outside the repository, `git worktree add <scratch>/pr-review-<number> origin/<headRefName>`, and remove it afterwards with `git worktree remove <scratch>/pr-review-<number>`. A fresh worktree has no `node_modules` or `vendor`, so language-server types and callers degrade, and its directory name does not match the gitnexus registry, so the Tools line reads `gitnexus: unavailable (...)` and graph sections are omitted.
2. Pick the targets from the changed source files: PHP, or JS/TS including `.mjs`, `.cjs`, `.mts`, `.cts`, and not named `*.test.*`, `*.spec.*`, or `*.stories.*`, which the script leaves out. Take the directory of each, then drop every directory that is an ancestor of another on the list. A dropped directory's own changed source files, and changed source files at the repo root, are targeted one file at a time instead of by directory, so `.` is never a target. Directories with no changed sources (manifests, docs, workflows) get no run.
3. Run the script once per target, always with `--no-docs`: a review needs no doc verdicts, and the flag keeps package names from being sent to context7.com. A run that still exits non-zero (a deleted directory, no sources) gets no per-directory fallback; item 4 covers its files.
4. Run the lighter brief's first three commands as well and keep their output, the stat block and the changed-symbol list, next to the script's output. The script details at most 15 symbols per directory, taken in file path order, so the symbol list is what shows the changes it dropped. Run the fourth command for each changed symbol that has no section in the script's output.

When the script's output lists no symbols and `git diff --stat` shows most of the changed lines are in `.py` files, build the brief from the commands below instead, and record under `## Not available in this run` that the structural brief came from the fallback commands.

If it is not, build a lighter one from these commands:

```sh
git diff --stat <BASE>...<HEAD>
git diff -U0 <BASE>...<HEAD> | grep -E '^@@'
git diff <BASE>...<HEAD> | grep -E '^\+(export )?(async )?(function|class|const|interface|type) |^\+[[:space:]]*(public|protected|private) function'
git diff <BASE>...<HEAD> -- '*.py' | grep -E '^\+[[:space:]]*(async )?def [A-Za-z_]|^\+[[:space:]]*class [A-Za-z_]'
git grep -nw <symbol> <HEAD>
```

`<BASE>` and `<HEAD>` are the two refs resolved in step 1, the same slots step 3 fills.

The first gives the shape of the change. The next three give the added or changed functions, classes, and methods, from the hunk headers and from the added lines. The last runs once per changed symbol and gives its callers on the head ref, which is what tells a stage whether a signature change has call sites the PR missed.

Every anchor in the third and fourth commands carries a `+`, so it matches added lines and not the context lines around them. Dropping the `+` inverts the result: every unchanged declaration in the hunk matches and every added one does not, and the per-symbol `git grep` then has nothing to run on.

The fourth command is for Python. A Python method is indented under its class, so its anchors allow leading whitespace before `def` and `class`. It reads only `*.py` files, as a separate command, because those indented anchors otherwise match markdown prose and nested TypeScript classes. For a Python symbol, run the caller command as `git grep -nw <symbol> <HEAD> -- '*.py'`. The word match finds a call, a decorator argument, and a reference passed as a value, such as `Depends(get_db)` or `callbacks=[handler]`, and the pathspec keeps a same-named symbol in another language out of the list. Search for the bare name, never a dotted module path: a Python project without a package layout imports a sibling module by bare name and may load a hyphenated script file by path.

An empty caller list for a Python symbol is not evidence of dead code when the symbol is a function a decorator registers (a web route, a CLI command, a pytest fixture), a method a framework calls by name (a pydantic validator, a `__dunder__` method), or a module imported for what it does at import time. None of them has a textual caller. List such a symbol in the brief as `callers unresolved`, not with an empty caller list.

Three dots, so only what the branch adds is in scope.

The commands run here produce the brief. Their output goes into the brief, not into a reading pass by the orchestrator. Keep each brief to roughly a page: the stat block, the symbol list, and the caller list.

## Step 3: run the passes

Per PR: one `code-review` invocation and three stage subagents, all dispatched in the same turn so they run in parallel where the harness allows. A three PR stack is three invocations and nine subagents.

### Workflow path

If a tool named `Workflow` is listed, the brief of step 2, the three stage subagents below, and the consolidation of step 4 run as the plugin workflow `review:pr-review-stages` instead of by hand. Invoke `code-review` first, exactly as the next section says, so both run at once. Then call the Workflow tool with `name` set to `review:pr-review-stages` and `args` set to the list from step 1, in merge order, as a JSON array value (never a JSON-encoded string), one object per PR:

```json
[
  {
    "number": 117,
    "title": "<title>",
    "base": "origin/<baseRefName>",
    "head": "origin/<headRefName>",
    "url": "<url>"
  }
]
```

The workflow builds each brief in a subagent, runs the three stage prompts below with every return validated against a schema, and returns `{ report, counts }`. `report` is the step 4 report without the `code-review` merge: every correctness finding carries `hand review only`, and the roll-up already names what the brief and the stages skipped. `counts` is one `{ number, correctness, typeSafety, comments }` per PR, a finding count per stage or `null` for a stage that did not report. Skip step 2 and the stage dispatch below, hold the result, and go to step 4 for the merge. The orchestrator still never opens the diff.

When the prompt that invoked this skill asks for instructions to reach the stages or the brief (the requirements the PR is meant to deliver, which repository files are the review standard, `--repo <owner>/<name>` on every `gh` call, which refs exist in the checkout, `sibling=` and `out=` for comment-audit, the package manager the gate commands use), add an `instructions` object to that PR, with any of `brief`, `correctness`, `typeSafety`, `comments`, and `all`, each a non-empty string:

```json
{
  "number": 117,
  "title": "<title>",
  "base": "origin/<baseRefName>",
  "head": "origin/<headRefName>",
  "url": "<url>",
  "instructions": {
    "all": "Pass --repo <owner>/<name> to every gh call.",
    "correctness": "The PR is meant to deliver: <requirements from the invoking prompt>."
  }
}
```

The script appends them to that agent's prompt after the filled template and before the trailer, under `## Additional instructions from the caller`, `all` first and the agent's own key after it; `all` reaches the brief and all three stages. An instruction that fits no single stage goes under `all`. A PR without `instructions` gets no such section. The script rejects an unknown key, or a value that is not a non-empty string, naming the key. Never rewrite the templates to carry the caller's instructions, and never drop them.

The Workflow tool exists only in Claude Code with workflows enabled. When it is not listed (another harness, `disableWorkflows`, a plan without workflows), or the call fails before any agent runs (a syntax error in the script, a refused launch, or `not found` because only the skill is installed, as after `npx skills add`), continue as written: build the briefs, dispatch the stage subagents, and consolidate by hand. Both paths produce the same report shape.

If the run stops after agents have run (the tool result reports an error, or the run was stopped from `/workflows`), relaunch it once with the `scriptPath` and `resumeFromRunId` from the first result and the same `args`, as the Workflow tool documents: completed agents return their saved results, and the failed agent and those started after it run again. The same relaunch covers a PR where one or two stage sections read `The stage did not report.` (that stage's agent died or exhausted its schema retries): its completed agents return from the saved results and the missing stage runs again. When a stage is still missing after the relaunch, dispatch that stage by hand with the template below and a brief rebuilt per step 2, and replace its roll-up line. A PR whose three stage sections all read `The stage did not report.` did not complete inside the workflow: build its brief and dispatch its three stage subagents by hand, as below, and write that PR's section by the step 4 rules before the `code-review` merge, replacing its roll-up line `PR <n>: the pipeline stopped before consolidation, so no stage reported` with what those stages skipped.

### Correctness, first pass: `code-review`

If a skill named `code-review` is listed, the orchestrator invokes it once per PR, from its own context, with the PR number as the target:

```text
code-review <number>
```

The skill runs its review in a background subagent and returns only that subagent's name. Its report arrives later as a task completion notification addressed to the session that invoked it. Invoked from the orchestrator, that is the orchestrator. Invoked from inside a stage subagent, the harness parents the background subagent to the top-level session anyway, so the notification bypasses the stage, and the stage waits for a result that never reaches it. That is why the stage template below reviews by hand and does not mention `code-review`.

The notification carries the report as text. Hold it for step 4. Consolidation waits until it has arrived; the correctness section is never written from what the skill was expected to find. If the skill is not listed, or its subagent stops without a report, the hand review is the only correctness pass, and `## Not available in this run` says so.

The same parenting applies one level down. At effort levels where `code-review` spawns its own finder subagents, those finders are registered under the orchestrator's session as well, so their results arrive at the orchestrator while the fork idles with nothing left to wait on. The sign is a completion notification from the fork saying its finders are still running, followed by idle notices from agents named `finder-*`. Collect every finder result that arrives, then send them verbatim in one message to the fork by its name, `code-review`. It resumes, runs its verification pass, and returns the consolidated report as a second completion notification. Finder results are candidates, not findings; only the fork's consolidated report enters step 4.

### Stage subagents

Each prompt is one of the templates below with these slots filled:

| Slot | Value |
| --- | --- |
| `<BRIEF>` | the whole brief from step 2, for this PR |
| `<BASE>` | `origin/<baseRefName>` from step 1 |
| `<HEAD>` | `origin/<headRefName>` from step 1 |
| `<PR_TITLE>` | the PR title |
| `<PR_URL>` | the PR url |

Instructions the invoking prompt asked to add to a stage, or to every stage, go after the filled template, under `## Additional instructions from the caller`, the same place the workflow puts them, and never inside the template.

Correctness stage, the second pass:

```text
Review PR "<PR_TITLE>" (<PR_URL>) for correctness. Base ref <BASE>, head ref <HEAD>.
Only what the branch adds is in scope: git diff <BASE>...<HEAD>, three dots.

Structural brief:
<BRIEF>

Review by hand: read the diff and the changed files, and look for behaviour changes,
error handling, boundary conditions, and missing tests. Validate any claim you can by
running the project's tests or linters; record what you ran.

For a Python project, run `pytest`, `ruff check`, and the configured type checker
(mypy, pyright, pyrefly, or ty), resolving each command the way step 0 of
`review:comment-audit` does. When pytest runs with `filterwarnings = ["error"]`, a
new deprecation warning fails the suite, so a passing run is also evidence that the
branch adds no warning. Look in particular for a mutable default argument; a bare
`except:` or an `except Exception: pass`; a coroutine called without `await`; `is`
compared with a literal; a collection mutated inside the loop that iterates it; a
`datetime.now()` without a timezone where the stored value has one; an f-string or
`%` interpolation inside a SQL or shell call; blocking I/O inside an `async def`
that belongs in `asyncio.to_thread` or an async client; and a module-level
environment read that raises at import time and so leaves the module untestable.
These are leads, not rules: each finding still ends with its outcome.

End every finding with its outcome, one of: crash, wrong data shown, wrong data
persisted, harmless, question. Harmless means no crash, no wrong data shown or
persisted, and an effect that clears on retry or reload. Question means the diff
could not settle the claim and you are asking the author. The outcome separates a
bug from a harmless edge case or a question, and a finding without one is graded as
a bug. A finding about structure rather than behaviour (dead code, duplication,
layering, a convention) ends with harmless.

Skills that run in a background subagent, `code-review` among them, deliver their
result to the session that spawned you, not to you. The orchestrator runs
`code-review` itself as a separate pass, so your findings are your own reading of
the diff.

Return exactly these three sections and nothing else:

## Findings
One entry per finding, each starting with `path:line` on the HEAD side, then the
claim in one or two sentences, then the outcome. No finding without a `path:line`.

## Validated
Every check you ran, with the command and its result.

## Skipped
Every skill, tool, or check you could not use, with the reason.
```

Type safety stage:

```text
Review PR "<PR_TITLE>" (<PR_URL>) for type safety. Base ref <BASE>, head ref <HEAD>.

Structural brief:
<BRIEF>

Invoke `review:type-safety-review base=<BASE> head=<HEAD>`. That skill returns its
report as its response and writes no file. Relay its findings in the shape below,
keeping each finding's rule id (`PHP-1` to `PHP-5`, `TS-1` to `TS-4`, `PY-1` to
`PY-5`), its verbatim quote, and its proposed shape.

That skill inherits comment-audit's `base=`/`head=` detection and its ask. Both are
already given above, so if it asks for anything else, you have no one to ask: record
the miss under `## Skipped` and carry on with the rest of the review rather than
stopping.

Return exactly these three sections and nothing else:

## Findings
One entry per finding, each starting with `path:line` on the HEAD side, then the
rule id, the quote, the reason, and the proposed shape.

## Validated
Every check you ran, with the command and its result.

## Skipped
Every skill, tool, or check you could not use, with the reason. Include the paths
the skill reported as skipped for being generated or vendored.
```

Comments stage:

```text
Review PR "<PR_TITLE>" (<PR_URL>) for comments and documentation. Base ref <BASE>,
head ref <HEAD>.

Structural brief:
<BRIEF>

Invoke `review:comment-audit base=<BASE> head=<HEAD>` in report mode. Never pass
`--apply`: this run reports and changes nothing. That skill writes its report to a
file. Read that file and return its summary and findings in the shape below.

That skill's step 0 asks for `readme=` when a MOVE verdict needs one, and for a
`base=` it cannot resolve. You have no one to ask. Both are already given above
except `readme=`, so if it asks for that, record the miss under `## Skipped`, take
the proposed text it writes without a path, and carry on with the rest of the
audit rather than stopping.

Return exactly these three sections and nothing else:

## Findings
The audit report lists findings as `**L123, VERDICT**` under a `### path` heading;
prefix each one you relay with the path from its file heading, so it reads
`path:line`. One entry per finding, each starting with `path:line` on the HEAD side,
then the verdict (DELETE, TRIM, MOVE, KEEP, UNSURE, WRONG), the verbatim comment,
and the rewrite or pointer where the verdict has one. For a DELETE or TRIM, also give
the comment's first and last HEAD line as `L<start>-L<end>`: the start is the audit's
`L123`, and the end is the start plus the comment's line count at HEAD minus one, so
a three-line comment at `L123` is `L123-L125` and the span the rewrite replaces is
explicit. KEEP verdicts may be one line each.

## Validated
Every check you ran, with the command and its result. Include the report file path
and the comment line count the audit opened with.

## Skipped
Every skill, tool, or check you could not use, with the reason.
```

Subagents may use IDE MCP tools, a local database, or a REPL when those exist in the setup. They record what they used under `## Validated` and what they could not under `## Skipped`. A stage that returns no `## Skipped` entries had everything it needed.

A subagent that cannot invoke its skill falls back to reviewing by hand against the same criteria and says so under `## Skipped`. It does not return an empty report.

## Step 4: consolidate

One report, written by the orchestrator from the subagent responses. It is the whole output of this skill:

```text
# Review: <PR list>

## <number> <title>
<url>

### Correctness
### Type safety
### Comments

## Not available in this run
```

Rules for the body:

- One section per PR, in the merge order given as input, holding the three stage sections.
- Every finding keeps its `path:line` from the HEAD side, so it can be pasted as a PR review comment, and keeps its outcome clause, which decides its label downstream.
- A finding two stages both reported stays under each stage that reported it, suffixed `also reported by <stage>`. The orchestrator has not read the diff and does not decide whether two claims at one line are one finding; `review:pr-comments` shows it once (step 5).
- `### Correctness` merges the two passes. A finding both passes reported appears once, labelled `both passes`. A finding one pass reported keeps its label, `code-review only` or `hand review only`, so the reader knows how much weight it carries. Where the passes disagree, both claims are listed under the finding; the orchestrator does not pick a side, since it has not read the diff.
- A stage with no findings gets its heading and one line saying so. An empty heading reads as a lost subagent.
- `## Not available in this run` names every skill or tool any subagent listed under `## Skipped`, once each, with the stages that wanted it. If `code-review` was not listed or returned no report, it is named here with the reason, and the correctness findings carry the `hand review only` label. When every stage had everything, the section says so in one line rather than being dropped.

On the workflow path the script has written everything above except the `code-review` merge, which stays a model step: a finding both passes reported becomes one entry relabelled `both passes`; a finding only `code-review` reported is added under `### Correctness` with `code-review only`; the `hand review only` labels the script wrote stay on the rest; and when `code-review` was not listed or returned no report, add it to `## Not available in this run` with the reason. Do not rewrite the rest of the report. When the finding you add lands under a `### Correctness` that reads `No findings.`, or the `code-review` line you add lands in a roll-up that reads `Every stage had everything it needed.`, replace that line. When `### Correctness` reads `The stage did not report.`, keep that line and add the `code-review only` findings under it.

## Step 5: comments for the author

The consolidated report is written for the reviewer and is not what a PR author reads. When the findings are going onto the PR, invoke `review:pr-comments` with the report: it drops the pass labels and rule ids, grades each finding from a fixed label, and gives it a code the author can refer to.

## Style

The consolidated report follows [../writing-comments/references/style.md](../writing-comments/references/style.md).
