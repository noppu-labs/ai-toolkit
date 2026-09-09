---
name: pr-review
description: Orchestrate a three-stage review (correctness, type safety, comment audit) of one PR or a stack of PRs, delegating each stage to a subagent with a structural brief and consolidating one report. Use when asked for a comprehensive, full, or three-stage PR review, or to review a PR stack.
---

# PR review orchestrator

Three reviews of the same diff, one subagent each, merged into one report. The orchestrator resolves the refs, builds a structural brief, dispatches the stages, and consolidates what comes back.

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

If a skill named `investigate` is available, invoke it for that PR's changed paths and use its brief.

If it is not, build a lighter one from these commands:

```sh
git diff --stat <BASE>...<HEAD>
git diff -U0 <BASE>...<HEAD> | grep -E '^@@'
git diff <BASE>...<HEAD> | grep -E '^\+(export )?(async )?(function|class|const|interface|type) |^\+[[:space:]]*(public|protected|private) function'
git grep -nw <symbol> <HEAD>
```

`<BASE>` and `<HEAD>` are the two refs resolved in step 1, the same slots step 3 fills.

The first gives the shape of the change. The next two give the added or changed functions, classes, and methods, from the hunk headers and from the added lines. The last runs once per changed symbol and gives its callers on the head ref, which is what tells a stage whether a signature change has call sites the PR missed.

Both anchors in the third command carry a `+`, so it matches added lines and not the context lines around them. Dropping the `+` inverts the result: every unchanged declaration in the hunk matches and every added one does not, and the per-symbol `git grep` then has nothing to run on.

Three dots, so only what the branch adds is in scope.

The commands run here produce the brief. Their output goes into the brief, not into a reading pass by the orchestrator. Keep each brief to roughly a page: the stat block, the symbol list, and the caller list.

## Step 3: run three stages

Three subagents per PR, so nine for a three PR stack, dispatched in parallel where the harness allows.

Each prompt is one of the templates below with these slots filled:

| Slot | Value |
| --- | --- |
| `<BRIEF>` | the whole brief from step 2, for this PR |
| `<BASE>` | `origin/<baseRefName>` from step 1 |
| `<HEAD>` | `origin/<headRefName>` from step 1 |
| `<PR_TITLE>` | the PR title |
| `<PR_URL>` | the PR url |

Correctness stage:

```text
Review PR "<PR_TITLE>" (<PR_URL>) for correctness. Base ref <BASE>, head ref <HEAD>.
Only what the branch adds is in scope: git diff <BASE>...<HEAD>, three dots.

Structural brief:
<BRIEF>

If a `code-review` skill is available, invoke it on `<BASE>...<HEAD>`. Otherwise
review for behaviour changes, error handling, boundary conditions, and missing
tests. Validate any claim you can by running the project's tests or linters;
record what you ran.

Return exactly these three sections and nothing else:

## Findings
One entry per finding, each starting with `path:line` on the HEAD side, then the
claim in one or two sentences. No finding without a `path:line`.

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
keeping each finding's rule id (`PHP-1` to `PHP-5`, `TS-1` to `TS-4`), its verbatim
quote, and its proposed shape.

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
the proposed section it writes without a path, and carry on with the rest of the
audit rather than stopping.

Return exactly these three sections and nothing else:

## Findings
The audit report lists findings as `**L123, VERDICT**` under a `### path` heading;
prefix each one you relay with the path from its file heading, so it reads
`path:line`. One entry per finding, each starting with `path:line` on the HEAD side,
then the verdict (DELETE, TRIM, MOVE, KEEP, UNSURE, WRONG), the verbatim comment,
and the rewrite or pointer where the verdict has one. KEEP verdicts may be one line
each.

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
- Every finding keeps its `path:line` from the HEAD side, so it can be pasted as a PR review comment.
- A finding two stages both reported appears once, under the stage that ruled on it most precisely, labelled with both stage names.
- A stage with no findings gets its heading and one line saying so. An empty heading reads as a lost subagent.
- `## Not available in this run` names every skill or tool any subagent listed under `## Skipped`, once each, with the stages that wanted it. When every stage had everything, the section says so in one line rather than being dropped.

## Style

The consolidated report follows [../writing-comments/references/style.md](../writing-comments/references/style.md).
