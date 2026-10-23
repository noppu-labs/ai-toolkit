---
name: pr-review
description: Orchestrate a three-stage review (correctness, type safety, comment audit) of one PR or a stack of PRs, delegating each stage to a subagent with a structural brief and consolidating one report. Use when asked for a comprehensive, full, or three-stage PR review, or to review a PR stack.
---

# PR review orchestrator

Three reviews of the same diff merged into one report: correctness, type safety, comments. Correctness runs as two independent passes: a `correctness-review` subagent that loads the `correctness-review` skill, and a subagent reviewing by hand. The orchestrator resolves the refs, builds a structural brief, dispatches everything with the `subagent` tool, and consolidates what comes back.

The orchestrator keeps its context lean. It reads briefs and subagent reports and nothing else. It never opens a diff, a changed file, or a `git show`, however small the PR looks. Everything that needs the diff happens inside a subagent.

## Input

```text
@pr-review <pr> [<pr> ...]
```

One PR number, or several forming a stack in merge order. Everything else is resolved from `gh`.

## Step 1: resolve the stack

For each PR number:

```sh
gh pr view <n> --json number,title,baseRefName,headRefName,headRefOid,url
```

Each PR is reviewed against its own `baseRefName`, never against the trunk. In a stack, PR two's base is PR one's head branch, so reviewing it against `main` would re-review PR one's diff. PR two's `<BASE>` is PR one's resolved `<HEAD>` rather than a separate fetch of `origin/<baseRefName>`, so the two reviews meet at the same commit.

Fetch the base branch and the PR head so the diff resolves in this clone. GitHub publishes every PR head on the base repository as `refs/pull/<n>/head`, fork or not, so the head comes from there and never from `<headRefName>`, which may live in a fork.

Before the fetch, check that `origin` is the repository `gh` resolves pull requests against: compare `nameWithOwner` from `gh repo view --json nameWithOwner` with `git remote get-url origin`. When they name different repositories (a clone of a fork with `gh` pointed at upstream, or a caller passing `--repo` for another repository), stop and say so: the base would be fetched from the wrong repository, and the SHA fallback cannot fix a base. Reviewing from a fork clone is out of scope.

```sh
git fetch origin <baseRefName> +refs/pull/<n>/head:refs/pr-review/<n>
```

The base and head passed to every stage are then `origin/<baseRefName>` and `pr-review/<n>`. `headRefName` is for display only. The `+` lets a re-review after a force-push update the ref. The ref lives outside `refs/remotes/origin/` because a plain `git fetch --prune` deletes anything there that is not a branch on the remote, and a branch named `pr/<n>` would overwrite it.

When `git rev-parse pr-review/<n>` differs from `<headRefOid>`, the branch moved after the `gh` call. Run `gh pr view <n> --json headRefOid` once more. If the refreshed value matches the ref, continue with the pull ref and the refreshed `<headRefOid>`. If it still differs, take the SHA fallback below with the refreshed `<headRefOid>`.

The SHA fallback is also taken when the pull ref cannot be fetched (a remote that does not publish it). A failed combined fetch leaves the base stale, so the fallback fetches the base together with the head commit and passes the SHA as `<HEAD>`:

```sh
git fetch origin <baseRefName> <headRefOid>
```

Every consumer of `<HEAD>` takes a commit-ish, so a bare SHA works in the `<BASE>...<HEAD>` diff, in `git rev-parse`, in `git grep`, and in `git worktree add`. If the branch is force-pushed after the `gh` call, the review stays on the commit `gh` reported.

Size each PR once its `<BASE>` and `<HEAD>` resolve, with the bundled script, which reads the same diff the stages review:

```sh
bash ${CLAUDE_PLUGIN_ROOT}/skills/pr-review/scripts/pr-size.sh <BASE> <HEAD>
```

It prints one line that starts with `lines=<n>` and ends with `correctness-review=1|3|4`, the number of subagents that run the `correctness-review` first pass: 1 up to 200 lines, 3 up to 1200, and 4 over that. The field between them is for Claude Code and is not used here. Take the count as printed and never recount by hand. The script counts added plus deleted lines and leaves out lockfiles, binary files, and the unchanged part of a moved or renamed file, so a file moved without edits counts zero. Each PR of a stack is sized on its own diff, since its `<BASE>` is the head of the PR below it. The number of files plays no part: a change spread over many files but a few hundred lines still fits in one context. The field sets how the first correctness pass runs in step 3. More subagents spread the same angles over more contexts rather than review more deeply, so the cutoffs are low. The thresholds live in the script and are a starting point to tune, not a measured value.

State the resolved pairs before starting, one line per PR: number, title, base, head, url, the script's line, and `head from SHA fallback` when the SHA fallback was used. If `gh` is unavailable, a number does not resolve to a PR, `origin` is not the repository `gh` resolves against, the SHA fallback fetch fails, `origin/<baseRefName>` still does not resolve, or the size script fails, stop and say which number failed. Do not guess a base ref.

## Step 2: structural brief

One brief per PR, plain text, pasted whole into every subagent prompt for that PR.

If the `investigate-brief` skill is listed (the `@noppu-labs/opencode-investigate` plugin), invoke the `investigate-brief` skill to get its script path from the paths its text shows, and build the brief from the script's output plus part of the lighter brief below. Paste the outputs concatenated as the brief.

1. Run the script in a checkout at `<HEAD>`, since it reads the working tree. When the current checkout is already there and clean (`git rev-parse HEAD` equals `git rev-parse <HEAD>` and `git status --porcelain` prints nothing), run it in place: that checkout has its `node_modules` or `vendor` and its gitnexus registration, so the brief is richer. Otherwise create a worktree named after the PR in a scratch directory outside the repository, `git worktree add <scratch>/pr-review-<number> <HEAD>`, and remove it afterwards with `git worktree remove <scratch>/pr-review-<number>`. A fresh worktree has no `node_modules` or `vendor`, so language-server types and callers degrade, and its directory name does not match the gitnexus registry, so the Tools line reads `gitnexus: unavailable (...)` and graph sections are omitted.
2. Pick the targets from the changed source files: PHP, or JS/TS including `.mjs`, `.cjs`, `.mts`, `.cts`, and not named `*.test.*`, `*.spec.*`, or `*.stories.*`, which the script leaves out. Take the directory of each, then drop every directory that is an ancestor of another on the list. A dropped directory's own changed source files, and changed source files at the repo root, are targeted one file at a time instead of by directory, so `.` is never a target. Directories with no changed sources (manifests, docs, workflows) get no run.
3. Run the script once per target, with the doc-source gate on, because the correctness stage checks the diff's library calls against the version-checked sources it lists. When context7 cannot be reached, the script marks each lookup `FAILED` and still builds the brief, and the review goes on without docs. A run that still exits non-zero (a deleted directory, no sources) gets no per-directory fallback; item 4 covers its files.
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

When the brief comes from the lighter commands, `## Not available in this run` notes that the structural brief came from the fallback commands and carries no graph or language-server detail.

## Step 3: run the passes

Per PR: one first correctness pass and three stage subagents, all dispatched as `subagent` tool calls in one message, with `agent: "general"` and without `background`. Calls in one message run in parallel and the turn waits for every result, so no report is lost when the session would otherwise go idle, as a headless `opencode run` does. Each call is `{ agent: "general", description, prompt }`, with the filled template as `prompt`. The first pass is as many `correctness-review` subagents as step 1's `correctness-review=` says, from one to four. A stack of three PRs of up to 200 lines each is three first-pass subagents and nine stage subagents.

A subagent cannot spawn subagents, so every prompt below is written for a single agent that loads skills with the `skill` tool and does the rest itself. Hold each report as it returns. Consolidation waits until every dispatched subagent has reported or stopped; a section is never written from what a subagent was expected to find.

### Correctness, first pass: `correctness-review`

Dispatch the first-pass template below as a stage subagent, in the same turn as the other stages. Its slots are filled as in the table under the next heading, plus `<ANGLES>`:

- `correctness-review=1`: one subagent runs with `<ANGLES>` set to `A,B,C,D,E`.
- `correctness-review=3`: three subagents run, with `<ANGLES>` set to `A,B`, `C`, and `D,E`.
- `correctness-review=4`: four subagents run, with `<ANGLES>` set to `A`, `B`, `C`, and `D,E`. E gets no subagent of its own, since it finds nothing when the diff touches no forwarding code.

When more than one subagent runs, the orchestrator merges their reports into one first-pass report by listing each subagent's findings. It combines two entries only when their `path:line` and outcome are identical, and it never judges whether two different claims are the same finding. An angle a subagent lists under `## Skipped` only because its `<ANGLES>` left it out is dropped from the merge when another subagent ran it. When some but not all of them do not report, the angles they owned go under `## Not available in this run`.

The merged report is held for step 4 as the first-pass report. When every first-pass subagent stops without a report, the hand review is the only correctness pass, and `## Not available in this run` says so. A first-pass subagent that could not invoke the skill and reviewed by hand says so under `## Skipped`; its findings carry the `hand review only` label, not `correctness-review only`.

Correctness stage, the first pass:

```text
Review PR "<PR_TITLE>" (<PR_URL>) for correctness. Base ref <BASE>, head ref <HEAD>.
Only what the branch adds is in scope: git diff <BASE>...<HEAD>, three dots.

Structural brief:
<BRIEF>

Invoke `correctness-review base=<BASE> head=<HEAD> angles=<ANGLES>`. That
skill returns its report as its response and writes no file. Use the brief as the
starting list of changed symbols and their callers.

A separate stage reviews the same diff by hand as the second correctness pass, so
your findings are this skill's reading of the diff alone.

Return the skill's three sections, `## Findings`, `## Validated`, and `## Skipped`,
unchanged and nothing else. If the skill cannot be invoked, review the diff by hand,
end every finding with its outcome (crash, wrong data shown, wrong data persisted,
harmless, question), and say so under `## Skipped`.
```

### Stage subagents

Each prompt is one of the templates below with these slots filled:

| Slot | Value |
| --- | --- |
| `<BRIEF>` | the whole brief from step 2, for this PR |
| `<BASE>` | `origin/<baseRefName>` from step 1, or the previous PR's `<HEAD>` in a stack |
| `<HEAD>` | `pr-review/<n>` from step 1, or `<headRefOid>` when step 1 fell back to the SHA |
| `<PR_TITLE>` | the PR title |
| `<PR_URL>` | the PR url |

Instructions the invoking prompt asked to add to a stage, or to every stage, go after the filled template, under `## Additional instructions from the caller`, and never inside the template. Instructions aimed at the brief, or at every agent, apply to step 2.

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
`comment-audit` does. When pytest runs with `filterwarnings = ["error"]`, a
new deprecation warning fails the suite, so a passing run is also evidence that the
branch adds no warning. Look in particular for a mutable default argument; a bare
`except:` or an `except Exception: pass`; a coroutine called without `await`; `is`
compared with a literal; a collection mutated inside the loop that iterates it; a
`datetime.now()` without a timezone where the stored value has one; an f-string or
`%` interpolation inside a SQL or shell call; blocking I/O inside an `async def`
that belongs in `asyncio.to_thread` or an async client; and a module-level
environment read that raises at import time and so leaves the module untestable.
These are leads, not rules: each finding still ends with its outcome.

When the diff calls a third-party library or works around one, check the call
against that library's docs. Take the source from the brief's doc sources: one whose
verdict starts with USE, or the pinned id when it starts with PIN; any other verdict
means no usable docs. Ask context7's `query-docs` how the documented API does the
same thing, and report code that works through a roundabout or undocumented path
where the docs give a direct one, citing the doc. When the brief lists no usable
source, or context7 is unavailable or a query fails, read the installed package under
`node_modules/` or `vendor/` instead, or skip the check and list it under
`## Skipped`. Missing docs never stop the review.

End every finding with its outcome, one of: crash, wrong data shown, wrong data
persisted, harmless, question. Harmless means no crash, no wrong data shown or
persisted, and an effect that clears on retry or reload. Question means the diff
could not settle the claim and you are asking the author. The outcome separates a
bug from a harmless edge case or a question, and a finding without one is graded as
a bug. A finding about structure rather than behaviour (dead code, duplication,
layering, a convention) ends with harmless.

The orchestrator runs `correctness-review` as a separate first pass, so your
findings are your own reading of the diff.

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

Invoke `type-safety-review base=<BASE> head=<HEAD>`. That skill returns its
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

Invoke `comment-audit base=<BASE> head=<HEAD>` in report mode. Never pass
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
- A finding two stages both reported stays under each stage that reported it, suffixed `also reported by <stage>`. The orchestrator has not read the diff and does not decide whether two claims at one line are one finding; `pr-comments` shows it once (step 5).
- `### Correctness` merges the two passes. A finding both passes reported appears once, labelled `both passes`. A finding one pass reported keeps its label, `correctness-review only` or `hand review only`, so the reader knows how much weight it carries. A first-pass finding from a subagent that reviewed by hand because it could not invoke the skill is labelled `hand review only`. Where the passes disagree, both claims are listed under the finding; the orchestrator does not pick a side, since it has not read the diff.
- A stage with no findings gets its heading and one line saying so. An empty heading reads as a lost subagent.
- `## Not available in this run` names every skill or tool any subagent listed under `## Skipped`, once each, with the stages that wanted it, and, when the brief came from the fallback commands, notes that the structural brief came from the fallback commands and carries no graph or language-server detail. If every first-pass subagent returned no report, the first pass is named here with the reason, and the correctness findings carry the `hand review only` label. When some but not all of a split first pass's subagents did not report, the angles they owned are named here, and the findings of the subagents that did report keep `correctness-review only`. When every stage had everything, the section says so in one line, besides the brief note when there is one, rather than being dropped.
- When step 1 fell back to the SHA for a PR, `## Not available in this run` says which trigger applied (`refs/pull/<n>/head` was not fetchable, or the branch moved after the `gh` call) and names the SHA reviewed, so the reader knows the head came from `gh` rather than from the pull ref.

## Step 5: comments for the author

The consolidated report is written for the reviewer and is not what a PR author reads. When the findings are going onto the PR, invoke `@pr-comments` with the report: it drops the pass labels and rule ids, grades each finding from a fixed label, and gives it a code the author can refer to.

## Style

The consolidated report follows [the comment style guide](${CLAUDE_PLUGIN_ROOT}/skills/writing-comments/references/style.md).
