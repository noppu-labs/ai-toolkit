# ADR-009: Plugin workflows beside prose skills

## Status

Accepted

## Context

`review:pr-review` orchestrates a three-stage PR review. Most of its SKILL.md is fan-out
plumbing written as prose for the model to execute by hand, and much of that prose is
defensive: never open the diff, wait for `code-review` before consolidating, an empty
stage still gets its heading, return exactly three sections, keep merge order. Each is a
rule the model has to obey on every run, and on a bad run it forgets one.

Claude Code's Workflow tool runs a JavaScript script that orchestrates subagents
deterministically. A plugin can ship such a script in a `workflows/` directory; it is
namespaced `/<plugin>:<meta.name>`, loaded by Claude Code only, and ignored by every
other harness and by `npx skills add`. The script is executed as the body of a function:
it returns its result with a top-level `return`, cannot `import` anything, and may not
contain a second `export`. Biome cannot parse that shape.

## Decision

The skill stays the primary, portable entry point. A plugin workflow is a second entry
point the skill selects when the Workflow tool is listed, and only for the plumbing: the
structural brief, the parallel stage dispatch with schema-validated returns, and the
consolidation. Stage content stays in the stage skills, and the `code-review` pass with
its merge stays in the skill, because a background fork started inside a workflow agent
reports to the wrong session.

The stage prompts and the brief instructions are duplicated verbatim into the script, and
a vitest file compares the script's copies with SKILL.md on every run. The same test
executes the script through the wrapper the runtime uses, with fake runtime globals, so
the consolidation is tested as code and the parse is checked there rather than by Biome.
The `review/workflows` folder is excluded from Biome (ADR-004 records the exclusion).

Workflows that fit this pattern are those where the control flow is the fragile part and
the content already lives in skills. A skill whose value is judgement, not plumbing, does
not get a workflow.

## Consequences

### Positive

- The defensive rules become impossibilities: the script has no tool to open a diff with,
  consolidation cannot start before the `await` returns, an empty stage's heading is a
  template, and merge order is the array order.
- A stack of PRs that dies at the eighth of nine stage agents resumes at the eighth.
- Consolidation (labels, cross-references, the roll-up) has example and property tests.
- Consumers on other harnesses see no change; the directory does not reach them.

### Negative

- Two code paths describe one review. The drift test catches a template change made in
  one place only; it cannot catch a behaviour rule changed in the prose and not in the
  script, or the reverse. Every change to step 2, 3, or 4 of SKILL.md needs a look at the
  script.
- One file in the repository is not linted or formatted by Biome.
- The workflow path needs Claude Code 2.1.248 or later with dynamic workflows enabled,
  and a headless run needs an allow rule.
- About a thousand words of SKILL.md are duplicated, escaped, inside a JavaScript file.
