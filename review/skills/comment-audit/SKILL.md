---
name: comment-audit
description: Audit every comment, docblock, JSDoc, GraphQL description, and markdown line a branch adds and give each a verdict (DELETE, TRIM, MOVE, KEEP, UNSURE, WRONG). Use before opening a PR, when reviewing a PR's comments, or when asked to trim, audit, or clean up comments. Report only by default; `--apply` edits and commits.
---

# Comment audit

Code that reads clearly needs no comment saying what it does. A comment earns its place only when no name, type, or signature can carry it. This skill walks every comment a branch adds, checks the claim each one makes against the code, and gives it exactly one verdict. Report mode writes one file and changes nothing else. `--apply` edits the comments and makes one commit.

Two calibration examples:

- **DELETE.** A `reportUnknownStatus()` docblock saying it calls `report()` rather than the logger because a log line cannot reach the error tracker. The method name already says it reports. A second paragraph explaining that the tracker's sender is synchronous HTTP is a WHAT any engineer reading the file already knows.
- **TRIM.** A `logTransportFailure()` docblock saying an unconfigured endpoint returns earlier with a warning and never reaches this method. That explains why a case looks unhandled here, so it survives. It should be one sentence, not a paragraph.

## Invocation

`/review:comment-audit [--apply] [key=value ...]`

| Argument | Meaning |
| --- | --- |
| `--apply` | Edit and commit instead of reporting only. |
| `base=` | The ref the branch merges into. |
| `head=` | The branch tip under audit. |
| `dirs=` | Space separated paths whose diff is in scope. |
| `readme=` | The README that holds, or indexes, rationale shared by two or more sites. |
| `ticket=` | Ticket id for the commit subject in apply mode. |
| `out=` | Path the report is written to. |
| `sibling=<name>:<path>` | A checkout of another system whose behaviour the comments claim. Repeatable. |

Without `--apply` the only file written is the report.

## Read first

- [../writing-comments/SKILL.md](../writing-comments/SKILL.md)
- [../writing-comments/references/deletion-patterns.md](../writing-comments/references/deletion-patterns.md)
- [../writing-comments/references/what-survives.md](../writing-comments/references/what-survives.md)
- [../writing-comments/references/style.md](../writing-comments/references/style.md)

Where they conflict with this file, this file wins.

## Step 0: resolve configuration

In this order, stopping at the first source that answers:

| Value | Argument | Detection | Ask if still missing |
| --- | --- | --- | --- |
| base | `base=` | `gh pr view --json baseRefName`; else the default branch of `origin` | yes |
| head | `head=` | `HEAD` | no |
| dirs | `dirs=` | every path in the diff, minus `vendor/`, `node_modules/`, lockfiles, and paths matching generated-code markers (`generated`, `wayfinder`, `.d.ts` under a generated dir, `*.min.*`) | no, but list the exclusions in the report |
| readme | `readme=` | nearest `README.md` at or above the directory with the most diffed files | yes, only when a MOVE verdict needs one |
| ticket | `ticket=` | branch name pattern `[A-Z]+-\d+`; else the PR title | no, fall back to `docs:` prefix |
| format, lint, test commands | none | the project's `CLAUDE.md` and `.claude/rules/*.md`; else `composer.json` / `package.json` scripts | yes, in `--apply` mode only |
| sibling checkouts | `sibling=` | none | no; claims about another system become UNSURE with the path that would settle them |
| out | `out=` | `<scratchpad>/comment-audit-<pr or branch>.md` | no |

Echo the resolved values at the top of the report.

When a row marked `yes` cannot be resolved and no answer is available, stop and report which value is missing. Do not guess a base ref.

## Step 1: baseline

```sh
bash ${CLAUDE_PLUGIN_ROOT}/skills/comment-audit/scripts/count-comment-lines.sh BASE HEAD DIRS
```

It prints one number: the added lines whose first non-blank characters are `//`, `#`, `*`, `/*`, `/**`, `"""`, `{/*`, or `<!--`. The report opens with it.

If the command fails, the ref does not exist in this clone. Run `git fetch` and retry, or re-resolve `base`. A count of `0` means the branch adds no comments; write the report saying so and stop.

Steps 2 through 4 read `git diff BASE...HEAD -- DIRS`. Three dots, so only what the branch adds is in scope.

## Step 2: duplicate pass

Inventory every rationale stated at two or more sites in the diff before ruling on any single comment.

For each one, first check whether the README or a markdown file beside it already covers it. If one does, the verdict is MOVE with a pointer and no new text. Otherwise decide where the text belongs.

### README or topic file

The README is read by everyone who opens the directory. A topic file beside it (`cache-keys.md`, `consent-flow.md`) is read only by someone who has a reason to. Ask one question: **would every reader of this directory need this before changing anything in it?**

- **Yes, and it is a few sentences: the README.** Facts about the whole service or module: what it owns, a contract every file in it honours, a hazard any edit can trip.
- **No: a topic file**, plus one index line in the README. Any one of these is enough:
  - It concerns one subsystem, flow, or file group rather than the whole directory.
  - It needs more than a short paragraph, a diagram, or a worked example.
  - A reader needs it only in a specific situation, such as changing a key shape or adding a provider.
  - The README section it would join is already long enough that a reader skims it.

Calibration:

- README: "Every job in this module is idempotent, because the queue redelivers on worker timeout." Every file depends on it, and it is one sentence.
- Topic file: why cache keys carry a version segment and how old entries expire across a deploy. Only someone changing a key needs it, and it wants a sequence diagram.

When the call is close, prefer the topic file. Splitting a file out later costs more than indexing one now. When an existing README section itself fails the question, say so in the report and suggest moving it out to a topic file with the new text.

A topic file gets an index line in the README naming the situation that sends a reader there, not a summary of the file:

```md
- [Cache keys](cache-keys.md): read before changing a cache key's shape or TTL.
```

Extend an existing topic file on the same subject before creating a new one. For every proposal give the target (README section or topic file, new or existing), the sites it replaces, the full proposed text, a mermaid diagram where it replaces paragraphs (flows, hierarchies, pipelines), the index line when the target is a topic file, and one sentence on why it goes there.

The pointer left at each site is one line: `See README.md, "<section>".`, `See <topic>.md.`, or `See <topic>.md, "<section>".` when the file has more than one section. Write the path relative to the repo root when the site is in another directory.

If no README resolves and a MOVE needs one, ask for `readme=`. With no answer available, propose the text anyway and name the missing path in the report.

## Step 3: verdicts

Every added comment, docblock, JSDoc, GraphQL description, Storybook description, and markdown line gets exactly one verdict:

- **DELETE**: restates what the code visibly does, or restates the name, signature, return type, or the guard on the next line.
- **TRIM**: a non-obvious WHY buried in prose. Give the rewrite. Fewest sentences, keeping the concrete reference (path, symbol, SQL, snippet, ticket).
- **MOVE**: stated at two or more sites, so it goes once into the README or a topic file beside it (step 2 decides which), with a one-line pointer at each site. Also MOVE a class docblock that explains one property onto that property, and a rationale about behaviour onto the test that guards it.
- **KEEP**: already the right size and altitude. Listed briefly so the reviewer knows it was read.
- **UNSURE**: the claim could not be verified. Say what would need to be read.
- **WRONG**: the comment claims something the code does not do. Say what the code actually does.

Good WHY examples, the kind that survive:

- A guard that looks missing here because it is handled elsewhere.
- A vendor behaviour that forced the shape, such as a library default or a framework directive limit.
- A deploy hazard, such as old cache entries under an old key shape, or a window between two deploys.
- An external contract, a schema or selection set the other side depends on.
- A bug class being prevented.
- A domain, product, or regulatory reason.

Rules for the rewrites:

- **Tests.** The `it()` or `test()` description is the comment, in every test framework. Keep prose only for a scenario that is not obvious from the name and the assertions.
- **Type annotations.** `@param`, `@return`, `@var`, `@phpstan-type`, `@property`, and JSDoc types are never removed. Only their descriptions are judged. A description that restates the name is a DELETE of the description, not of the annotation.
- **GraphQL descriptions.** A `"""` description is a comment and is judged by the same rules. List every one with a verdict in its own report section, because they show up in introspection.
- **Storybook stories.** A story's name is its comment. Prose that describes the rendered state is a DELETE.

## Step 4: verify before ruling

- Before writing DELETE, TRIM, or WRONG for a WHY claim, open the code the comment refers to and check the claim. A search hit is not a check; read the body.
- Claims about another system are checked in the checkout passed as `sibling=<name>:<path>`. With no sibling for that system, the verdict is UNSURE and the report names the file that would settle it.
- Never propose a code change. This audit rules on comments only, in both modes.
- A comment that exists because the code around it is confusing goes under UNSURE, with the code left out of scope.

## Step 5: report

Write the report to `out` in the shape of [references/report-template.md](references/report-template.md).

Line numbers are from the HEAD side of the diff so they can be pasted as PR review comments. Quote every comment verbatim; the reviewer should not need the diff open to follow the report.

The template's two summary requirements are easy to drop and both are mandatory: state the added comment line count **and** an estimate of what remains once every DELETE, TRIM, and MOVE lands, and open the Summary with the three or four findings that matter most, not just a verdict tally. Derive the after-count `M` as `N` minus the lines of every DELETE, minus the lines removed by every TRIM and MOVE, where a MOVE leaves one pointer line per site.

## Apply mode

- Edit comments, docblocks, JSDoc, the README and topic files beside it, and schema descriptions only. Never change code.
- A comment that is WRONG is corrected to match the code, never the code changed to match the comment. List every correction.
- A comment that exists because the code is confusing is left in place and listed.
- Never touch generated files, files outside `dirs`, `vendor/`, `node_modules/`, or lockfiles.
- Commit the trim first, subject `<TICKET>: trim comments and docblocks` (or `docs: trim comments and docblocks` when no ticket resolved), so the verify script has a commit to compare against:

  ```sh
  bash ${CLAUDE_PLUGIN_ROOT}/skills/comment-audit/scripts/verify-comments-only.sh FROM TO DIRS
  ```

  `FROM` is the commit before the trim and `TO` is the commit carrying it, so `HEAD~1 HEAD` after the commit. The script prints every changed line that is not a comment or blank and exits `1`. It excludes `*.md` files, so doc edits never appear as hits. Every hit gets a one-line explanation in the report. Two kinds of hit are expected and still get their line:
  - A blank line left where a docblock shrank to nothing.
  - Interior lines of a block comment that carry no per-line marker: the body of a multi-line `<!-- -->`, or a `/* */` block without a leading `*` on each line.

- Run the project's format, lint, and test commands, in that order, using the commands resolved in step 0. If one of them could not be resolved, skip it and say so in the final message.
- If the formatter changes a file the audit did not touch, revert that file. Amend the trim commit with formatter changes to files the audit did touch, so the branch still carries one commit.
- Quote, do not summarise, the output of any step that did not pass.
- One commit. No push.
- The final message carries: comment line counts before and after, README sections and topic files added or extended, with the index lines added, comments corrected under WRONG, verify hits with an explanation for each, comments kept but unsure, and quoted tool output for any step that failed.

## Style

Comments, rewrites, and the report itself follow [../writing-comments/references/style.md](../writing-comments/references/style.md).
