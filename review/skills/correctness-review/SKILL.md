---
name: correctness-review
description: Hunt correctness defects in a diff through named angles (hunk scan, removed behaviour, callers and callees, language pitfalls, wrapper routing) and drop a candidate only when the code refutes it. Use for a correctness or bug review of a branch or PR, and as the first correctness pass of pr-review.
---

# Correctness review

This skill looks for defects a diff introduces: code that crashes, shows wrong data, or persists wrong data. It treats every assumption the change makes as a claim to check, and ties every finding to a line. It works through named angles one at a time in a single context, sweeps once for gaps, and keeps every candidate the code does not refute.

## Input and scope

```text
/review:correctness-review base=<ref> head=<ref> [angles=<list>]
/review:correctness-review <pr> [angles=<list>]
```

On OpenCode the skill is `correctness-review`.

- `base=` and `head=` name the two commits to compare. When one is missing and no PR number is given, stop and say which.
- A PR number is resolved as in step 1 of [../pr-review/SKILL.md](../pr-review/SKILL.md):
  1. Run `gh pr view <n> --json baseRefName,headRefOid`.
  2. Run `git fetch origin <baseRefName> +refs/pull/<n>/head:refs/pr-review/<n>`. The base is `origin/<baseRefName>` and the head is `pr-review/<n>`.
  3. When the pull ref cannot be fetched, run `git fetch origin <baseRefName> <headRefOid>` and use `<headRefOid>` as the head.
  4. When `gh` is unavailable or the number does not resolve, stop and say so. Do not guess a base.
- `angles=` is a comma-separated subset of `A,B,C,D,E`, the angles below. It defaults to all five. A letter outside that set is ignored and listed under `## Skipped`.
- The diff is `git diff <base>...<head>`, three dots, so only what the branch adds is in scope.
- Read files as they are at the head. When the working tree is not a clean checkout of `<head>`, read them with `git show <head>:<path>` and search them with `git grep <pattern> <head>`.
- The skill is read-only. It edits no file, makes no commit, and posts no comment or review. Running the project's tests or linters is allowed, and every run is recorded.
- Before the angles, read the repository's instruction files (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, and the like) at the root and in the directories the diff touches. They name the test commands and the invariants the code is expected to keep.

## Reading rules

- Read every changed file whole, not only its hunks. A hunk shows what changed; the file shows the state it runs against.
- Before reading a function's body, state its contract in a sentence or two: what it accepts, what it returns, what it changes, what it throws, and what its callers rely on. Then read the body against that statement. A body that breaks its contract is a candidate.
- Assume every external call can fail: network, filesystem, database, subprocess, parsing, a third-party API. For each one, ask what the caller does and what state is left half-written when it errors, times out, returns nothing, or runs twice.
- A search hit is not a read. Open the definition before ruling on it.

## Angles

Run the angles that `angles=` names, one after another in this context, in letter order. Each yields candidates: a `path:line` on the head side, the claim, and the input or sequence of events that triggers it. Rule on nothing yet; the drop rule comes after the sweep.

### A: hunk by hunk

Walk every hunk line by line, together with the function that encloses it. Trace concrete inputs through the code rather than inferring a bug from an unfamiliar pattern. Look at:

- boundaries: empty and single-item input, the first and last page, maximum values, Unicode and locale, a second call with the same input;
- errors and cleanup: a failure swallowed, cleanup that runs on one path only, a status code that misreports the result, a missing timeout, a retry with no bound;
- state and concurrency: a stale read, a lost update, a check and a use that another writer can split, a duplicate delivery, a retry that is not idempotent, a listener never removed;
- authorization and trust: a missing permission check, the wrong caller identity, input trusted across a boundary without validation, injection, path traversal, a secret written to output;
- data integrity: a partial write, a migration that cannot restart, an assumed uniqueness, a cascade that deletes more than intended, old and new code running side by side.

### B: removed behaviour

For every deleted or replaced line, name the invariant it enforced: a check, a default, an ordering, a side effect, an error path. Then find where the head enforces it again. When nothing does, that is a candidate. A line that moved counts as removed until you find it at its new place.

### C: callers and callees

For every function, method, or exported symbol the diff changes, find its callers on the head with `git grep -n <name> <head>` and read each call site. Check that each caller still gets what it relies on: argument order and meaning, the shape of the return value, the errors thrown, nullability, side effects. Then read every callee the changed code calls for the first time, or calls differently, and check the call against that callee's contract.

A name search misses callers reached by a string: a route, an event name, a config map, a container binding. Search for the string as well.

### D: language and framework pitfalls

Check the hunks against the traps of the language and framework in use. These are examples, not a list to complete:

- a promise or coroutine that is never awaited, or an async callback passed to `forEach`;
- loose equality, the truthiness of `0` and `""`, `null` against `undefined`;
- an off-by-one in a slice or range, float equality, integer overflow;
- a date without a timezone, a sort or format that depends on locale;
- a mutable default argument, a collection changed while it is iterated;
- an ORM query in a loop, a write outside the transaction it needs, mass assignment of an unguarded field;
- a lifecycle hook that runs twice, a cache that is never invalidated, a request-scoped value held by a long-lived object.

### E: wrapper and proxy routing

For a wrapper, proxy, decorator, middleware, adapter, or any function that forwards to another, check that it:

- passes on every argument, option, and context value;
- returns the callee's result and lets its errors through, or translates them on purpose;
- routes every case to the right target, including a method or variant the change adds to the wrapped API;
- keeps its defaults the same as the callee's.

When the diff touches no forwarding code, the angle yields nothing. Say so under `## Validated`.

## Gap sweep

Merge candidates that share a root cause into one, at the line where the fix belongs. Then read the diff once more, looking only for defects the list does not hold yet: paths no angle walked, a file you read quickly, two changes that interact. Add what you find as candidates.

## Drop rule

Rule on each candidate now.

- Drop a candidate only when it is refuted: the code shows the claim is false, or a guard elsewhere stops the trigger. Quote the line that proves it, with its `path:line`, under `## Validated`. Finding the trigger unlikely is not a refutation.
- A candidate you can neither confirm nor refute stays in. Mark it uncertain and name the file, test, or fact that would decide it.
- When a focused test or a short reproduction is the quickest way to decide a candidate, run it and record the command and result.
- These are never findings:
  - a problem on a line the diff does not change, unless the change makes it newly reachable, in which case the finding sits on the changed line;
  - anything a linter, compiler, or type checker reports;
  - style, naming, formatting, and design preference.
- There is no quota. When nothing survives, `## Findings` says `No findings.` and nothing else.

## Output

Return exactly these three sections and nothing else.

### `## Findings`

One entry per finding, crash first. Each entry starts with `path:line` on the head side, then the claim in one or two sentences, then the outcome. An uncertain finding has `(uncertain)` after its `path:line` and says what would decide it. No finding without a `path:line`.

End every finding with its outcome, one of: crash, wrong data shown, wrong data persisted, harmless, question. Harmless means no crash, no wrong data shown or persisted, and an effect that clears on retry or reload. Question means the diff could not settle the claim and you are asking the author. The outcome separates a bug from a harmless edge case or a question, and a finding without one is graded as a bug. A finding about structure rather than behaviour (dead code, duplication, layering, a convention) ends with harmless.

One filled example:

```text
src/billing/invoice.ts:58 `applyDiscount()` now returns early when `lines` is empty, so `invoice.total` keeps the previous invoice's value and is saved with it. Outcome: wrong data persisted.
```

### `## Validated`

Every check you ran, with the command and its result; each angle you ran and what it covered; and each dropped candidate with the quoted line that refutes it.

### `## Skipped`

Every angle not run, file not read whole, and check that could not run, with the reason.

The report follows [../writing-comments/references/style.md](../writing-comments/references/style.md).

## Attribution

Parts of this skill adapt emdash-cms/emdash `adversarial-reviewer` under the MIT license; see [NOTICE.md](NOTICE.md).
