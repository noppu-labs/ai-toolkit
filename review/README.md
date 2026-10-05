# Review toolkit

Code review skills for PHP, TypeScript, and Python, installed as the `review` plugin of
this marketplace (`/plugin install review@ai-toolkit`, or `npx skills add
noppu-labs/ai-toolkit/review` for other harnesses).

| Skill | Purpose |
| --- | --- |
| `review:pr-review` | Orchestrates a three-stage review (correctness, type safety, comments) of one PR or a stack, with a structural brief per PR, and consolidates one report. |
| `review:pr-comments` | Turns a review report into graded, coded comments a PR author reads. |
| `review:comment-audit` | Gives every comment, docblock, and docstring a branch adds a verdict. |
| `review:type-safety-review` | Rules a diff or a path against the type-safety checklists for PHP, TypeScript, and Python. |
| `review:writing-comments` | What belongs in a comment and what to cut. |

## The `pr-review-stages` workflow

`workflows/pr-review-stages.js` is a Claude Code [dynamic workflow](https://code.claude.com/docs/en/workflows#distribute-a-workflow-in-a-plugin). When the Workflow tool is listed, `review:pr-review` runs the structural brief, the three stage subagents, and the consolidation through it instead of by hand: the script holds the fan-out, every stage return is validated against a schema, the consolidation is plain JavaScript, and a run that stops part way resumes from the last completed agent. `/workflows` shows its three phases, `Brief`, `Stages`, and `Consolidate`. The `code-review` pass and the merge of its report stay in the skill.

When the tool is not listed, the skill's prose path runs and produces the same report shape. That is the case on other harnesses, after `npx skills add` (which installs `skills/` only), with `disableWorkflows` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, and on a plan where dynamic workflows are off.

Requirements: Claude Code 2.1.248 or later with dynamic workflows enabled. 2.1.248 is the release the Claude Code changelog names for the workflow authoring reference the script follows (the workflows documentation names no version); the plugin was verified on 2.1.289.

Permissions: an interactive session asks before the first run and offers "don't ask again for `pr-review-stages`" per project; auto mode asks on the first launch only; `claude -p` and the Agent SDK never prompt and need the allow rule `Workflow(review:pr-review-stages)`.

The stage prompts and the brief instructions live in `skills/pr-review/SKILL.md`; the script carries verbatim copies, and `scripts/review-workflow.test.ts` in this repository fails when they differ. To change a stage prompt, edit SKILL.md first, then copy the new text into the script's template constant, escaping backslashes, backticks, and `${`.
