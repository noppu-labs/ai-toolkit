# Review toolkit

Code review skills for PHP, TypeScript, and Python, installed as the `review` plugin of
this marketplace (`/plugin install review@ai-toolkit`, or `npx skills add
noppu-labs/ai-toolkit/review` for other harnesses).

| Skill | Purpose |
| --- | --- |
| [`review:pr-review`](https://toolkit.noppu.com/skills/pr-review) | Orchestrates a three-stage review (correctness, type safety, comments) of one PR or a stack, with a structural brief per PR, and consolidates one report. |
| [`review:correctness-review`](https://toolkit.noppu.com/skills/correctness-review) | Hunts correctness defects in a diff through five named angles and a gap sweep, keeping every candidate the code does not refute. The first correctness pass of `pr-review` where the harness has no `code-review` skill. |
| [`review:pr-comments`](https://toolkit.noppu.com/skills/pr-comments) | Turns a review report into graded, coded comments a PR author reads, with a GitHub suggestion block where the fix is a few lines of file text. |
| [`review:comment-audit`](https://toolkit.noppu.com/skills/comment-audit) | Gives every comment, docblock, and docstring a branch adds a verdict. |
| [`review:type-safety-review`](https://toolkit.noppu.com/skills/type-safety-review) | Rules a diff or a path against the type-safety checklists for PHP, TypeScript, and Python. |
| [`review:writing-comments`](https://toolkit.noppu.com/skills/writing-comments) | What belongs in a comment and what to cut. |

## OpenCode

The same skills ship as the OpenCode plugin `@noppu-labs/opencode-review`. It targets OpenCode V2.

Install it with the plugin command, or list it under `plugins` in your OpenCode config:

```bash
opencode plugin add @noppu-labs/opencode-review
```

```json
{
  "plugins": ["@noppu-labs/opencode-review"]
}
```

Update with `opencode plugin update`.

Invoke a skill with `@<skill>`, for example `@pr-review`, or pick one from `/skills`. The skill
names are the six in the table above without the `review:` prefix.

Differences from the Claude Code plugin:

- `pr-review` uses `correctness-review` instead of `code-review`, and has no Workflow.
- `pr-review` builds its brief with `investigate-brief` when `@noppu-labs/opencode-investigate` is
  installed, and with git-only commands otherwise.
- The task-output hook is Claude-only.

`npx skills add` also reaches OpenCode, but it leaves `${CLAUDE_PLUGIN_ROOT}` unresolved, so the
npm plugin is the supported route there.

## The reviewed head

`pr-review` reviews the newest head `gh` reports for a PR, not the commit the working tree is on, and takes no argument to choose another. A caller that prepares the checkout before the review starts, such as a CI runner that checks the PR out, runs setup, and then invokes the skill, can be on a different commit: the branch was pushed in between, or the checkout was of an older head. The plugin covers that case in three places:

- `correctness-review`, `type-safety-review`, `comment-audit`, `pr-comments`, and every stage prompt of `pr-review` read a file with `git show <head>:<path>` when the working tree is not a clean checkout of the head. `comment-audit --apply` edits the working tree, so it checks first that the tree is a clean checkout of the audited head; when it is not, the report is still written and no edit is made.
- The consolidated report has a `Reviewed head: <sha>` line under each PR's url, with the full SHA. A caller finds it with `^Reviewed head: [0-9a-f]{40}$` and compares it with `git rev-parse HEAD`. When the two differed at the start of the run, `## Not available in this run` says so, one line per PR.
- `pr-comments` copies that SHA into its `format=json` output as the optional top-level `headSha`, for a report of one PR. A poster can send it as the review's `commit_id`. For a report of several PRs it reads each finding's file at the `Reviewed head:` of that finding's PR section and leaves `headSha` out.

Two things are not covered. The tests, linters, and type checkers a stage runs still read the working tree, so their results describe the commit checked out. And the harness's `code-review` skill, which runs the first correctness pass on Claude Code, gets only the PR number and none of these instructions, so it may have read the working tree; its findings are merged under the same `Reviewed head:` line, and the mismatch line in `## Not available in this run` says so.

### Setting up the head

In an interactive session, when the working tree is not at a PR's head, `pr-review` asks once how to get there, through `AskUserQuestion` on Claude Code or `question` on OpenCode:

- Check out the PR in this tree. This is offered only when the tree is clean. The skill runs `git switch --detach` to the head and switches back afterwards. It is the one choice that also fixes the `code-review` first pass, which reads the current checkout. For a stack it checks out the top of the stack.
- A scratch worktree with the install run in it, one per PR in a stack. The tests and checkers of the stages then run against the head, not the tree you started in. The worktree is removed when the review ends.
- Continue as is.

The install runs code from the PR: lockfile commands, and any install hooks the PR defines such as `postinstall` or `post-install-cmd`. The question shows the install command and those hooks before you answer, and a typed answer such as "without scripts" runs the install with `--ignore-scripts` or `--no-scripts`. Answering the question grants nothing: the commands then run as ordinary Bash calls, one at a time, so your permission mode and allow rules decide whether each one prompts.

The question never appears in `claude -p`, which has no permission host to answer it, or in `opencode run`. Those runs behave as before, and a caller that prepares its own checkout keeps doing so.

## The task-output hook

`hooks/hooks.json` registers `hooks/guard-task-output.mjs` as a `PreToolUse` hook on `Bash` and `Read`, with an `if` rule on each (`Bash(*.output*)`, `Read(//**/*.output)`) so Node only starts for a call that names a `.output` path. Those rules need Claude Code 2.1.176 or later to match reliably. It denies a call that names a `.output` file when that file is a symlink, which is what a background subagent, such as the one `code-review` runs, leaves in the session's `tasks/` directory. The symlink points at the subagent's JSONL transcript under `~/.claude`, so Claude Code treats any read or copy as touching a sensitive file and stops on a permission prompt, which stalls an unattended worker. The deny reason tells the agent that the report is the completion notification's text and to write that text to the scratchpad instead. Background Bash tasks write plain `.output` files, and the hook leaves those alone. It needs `node` on `PATH` and lets the call through on any input it cannot parse. It matches paths as written, so a path the shell builds (a variable, a glob, a `cd` earlier in the same command) gets through; the instruction in `pr-review` is the primary defence.

## The `pr-review-stages` workflow

`workflows/pr-review-stages.js` is a Claude Code [dynamic workflow](https://code.claude.com/docs/en/workflows#distribute-a-workflow-in-a-plugin). When the Workflow tool is listed, `review:pr-review` runs the structural brief, the three stage subagents, and the consolidation through it instead of by hand: the script holds the fan-out, every stage return is validated against a schema, the consolidation is plain JavaScript, and a run that stops part way can be relaunched in the same session, where completed agents return their saved results and the failed agent and those after it run again. `/workflows` shows its three phases, `Brief`, `Stages`, and `Consolidate`. The `code-review` pass and the merge of its report stay in the skill.

Each PR in `args` carries `headSha`, the full SHA of the commit under review. The script hands it to the brief and to every stage as the head, never the ref in `head`, which another review of the same PR can move, and prints it as that PR's `Reviewed head:` line. Each PR may also carry an `instructions` object with any of `brief`, `correctness`, `typeSafety`, `comments`, and `all`, each a non-empty string the script appends to that agent's prompt under `## Additional instructions from the caller` (`all` reaches the brief and every stage). The skill fills it from the prompt that invoked it, so a headless caller's run-specific context, such as the requirements the PR delivers, `--repo` on every `gh` call, or which refs were fetched, reaches the stages on the workflow path as it does by hand. A PR without it gets no such section. A PR may also carry `checkout`, the absolute path of a checkout of that head, such as the scratch worktree `pr-review` set up. The script then adds a "Checkout of the head" block to the brief and to every stage prompt, so they read and run commands there.

When the tool is not listed, the skill's prose path runs and produces the same report shape. That is the case on other harnesses, with `disableWorkflows` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, and on a plan where dynamic workflows are off. After `npx skills add`, which installs `skills/` only, the workflow is missing: on Claude Code the Workflow call fails with `not found` and the prose path follows.

Requirements: Claude Code 2.1.248 or later with dynamic workflows enabled. The workflows documentation names 2.1.248 for `/workflow-authoring`, the reference the script follows, and names no release for plugin `workflows/`; the plugin was verified on 2.1.289.

Permissions: an interactive session asks before the first run and offers "don't ask again for `pr-review-stages`" per project; auto mode asks on the first launch only; `claude -p` and the Agent SDK never prompt and need the allow rule `Workflow(review:pr-review-stages)`.

The stage prompts and the brief instructions live in `skills/pr-review/SKILL.md`; the script carries verbatim copies, and `scripts/review-workflow.test.ts` in this repository fails when they differ. To change step 2 or a stage prompt, edit SKILL.md first, then copy the new text into the script's template constant, escaping backslashes, backticks, and `${`.
