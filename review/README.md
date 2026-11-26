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

Two things are not covered. Unless a worktree, clone or check-out was set up at the start (see below), the tests, linters, and type checkers a stage runs still read the working tree, so their results describe the commit checked out. And the harness's `code-review` skill, which runs the first correctness pass on Claude Code, gets only the PR number and none of these instructions, so it may have read the working tree; its findings are merged under the same `Reviewed head:` line, and the mismatch line in `## Not available in this run` says so.

### Setting up the head

When the working tree is not at a PR's head, `pr-review` can get there before the stages run. It asks through `AskUserQuestion` on Claude Code or `question` on OpenCode, and only when such a tool is listed. A caller's prompt that names a setup (check-out, scratch worktree, separate clone, or continue as is) decides it with or without that tool, and nothing is asked, the leftover-record question included. When the prompt names no setup, one that says not to ask, or not to modify the checkout, means continue as is, gets no setup line, and asks nothing; describing the checkout, or "install it if missing", does not name a setup. With no question tool and no named setup, `claude -p` and `opencode run` behave as before. A cancelled or unanswered question also means continue as is.

The git steps run in `scripts/head-setup.mjs`, one `node` call each, so permission rules written for git commands do not see them. If `node` is missing or the script fails, nothing is set up and the report says why. A leftover record from an earlier run (see below) is asked about first, in its own question, even when no PR differs from the tree's commit, and only when a question can be asked and no prompt named a setup or said not to ask. A run that does not ask, an unattended one for instance, leaves a readable record alone: a check-out refuses with `already-recorded` and continues as is, and a worktree or clone proceeds; an unreadable record makes every `enter` refuse, and the run continues as is. The question says that restoring switches a check-out back and removes every recorded worktree and clone by force: restore it or leave it. An unreadable record offers only continue as is and names `forget`. After a restore, the plan and the comparison with the tree's commit are redone.

- Check out the PR in this tree, offered first and marked recommended when the tree is clean, no check-out is already recorded, and the tree is not already at the head (for a stack, the top of the stack). It switches to the head with hooks off and never over an ignored file, and installs only for lockfiles the PR changed or whose dependencies are missing, with scripts on. The question names the session config the PR changes (`.claude`, `.mcp.json`, `opencode.json`, `.opencode`, `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`; a file or link named `.claude` or `.opencode` counts too) and warns that its settings, hooks and project instructions may take effect once checked out; paths are shown with control characters escaped, as data. When the install changed tracked files they are reset to the head and the report says so. Afterwards the tree is switched back, the paths of any untracked files left in the tree are listed, and the user's own dependencies are reinstalled when a lockfile differed. For a stack it checks out the top of the stack. It is the one choice that also fixes the `code-review` first pass, which reads the current checkout; for a stack's lower PRs that pass sees the top of the stack too.
- A scratch worktree with the install run in it, one per PR in a stack except a PR already at the tree's commit. The stages' tests and checkers then run against the head. A worktree shares `.git` with the repository, so an install can change its git config and hooks; the question says so. The worktree is removed when the review ends. Separately, when the tree is not a clean checkout of the head, the brief runs in a worktree the agent makes in the scratch directory, with the repository's git hooks on, and removes afterwards.
- Continue as is.

Two typed answers have no option of their own, and a caller's prompt may give either. "Without scripts" runs each install with the manager's flag: `--ignore-scripts` for npm, pnpm, bun and yarn 1; `--mode=skip-build` for yarn 4; `--no-scripts --no-plugins` for composer; `uv sync --frozen --no-install-local --no-build`; `--no-root --no-directory` with `POETRY_INSTALLER_ONLY_BINARY=:all:` for poetry; `go mod download` unchanged. Bundler gets no install, and a project entry point is not run. This does not promise that no PR code runs: tool configuration, dependency installs and build backends may still run it, and the report names the flag instead. "Separate clone" uses `git clone --shared --no-checkout` in the scratch directory in place of a worktree, so the repository's own git config and hooks are not shared. It is refused as `shallow-source` or `partial-source` when the repository is a shallow or partial clone, and as `setup-failed` when the clone is incomplete after its switch.

The install runs code from the PR: lockfile commands and the install hooks the question lists as found, which is not every file an install can run. A lockfile whose directory tracks `node_modules`, `vendor`, `.venv` or `.pnp.cjs` as a symlink gets no install (`symlinked-install-dir`). Answering the question grants nothing: the install commands run as ordinary Bash calls, one at a time, so your permission mode and allow rules decide whether each one prompts.

What `head-setup.mjs` writes: a record, `pr-review-setup.json`, in the working tree's own git directory, so parallel worktrees of one clone never see each other's; a lock file beside it, `pr-review-setup.lock`, held by `enter`, `restore` and `forget` so that one runs at a time (a second one refuses with `busy`, and a lock whose process is gone is taken over); and a marked `pr-review-*` directory inside the scratch directory for a worktree or clone. `restore` runs after the last pass, passing only the ids this run entered (the id of an `enter` that printed no JSON is recovered from the record); an id it does not know is declined as `unknown-id` and the rest are restored. It switches a check-out back only when HEAD is still detached at the head and no tracked file is changed, otherwise it leaves it and prints the reason, paths and, for a check-out, the command to run. A tree that is back on the branch but still has tracked changes (a switch that was cut short) is declined as `back-but-dirty` until it is clean or `forget` clears the record, and a switch that fails after it wrote files, whose `git status` then fails, or whose switch back exits 0 but leaves the tree changed, is refused as `switch-incomplete` with the `id`, the dirty paths and a `command` that discards the tracked changes, the record kept. Untracked files never block a restore; each restored entry lists them as `untracked`, and `status.showUntrackedFiles` has no say. The scripts look tools up only in absolute `PATH` entries outside the repository, found by walking up from the working directory to the nearest `.git`, so a `.git` far above, such as a dotfiles repository in the home directory, skips every entry below it. A check-out restore waits (`busy`) while git's `index.lock` exists; a worktree git left locked as `initializing` is removed with `--force --force`. It removes only recorded scratch directories: a clone, and a leftover directory a crash left behind, need the marker file the script wrote, a worktree must be registered with git, and a symlinked scratch directory or head directory is refused. A restore that fails for one entry is declined and the others go on. It reports the lockfiles that differed, and whether each still exists in the tree switched back to, so the reinstall is done for the ones that do. A record that does not validate is not used: `forget` clears it.

## The task-output hook

`hooks/hooks.json` registers `hooks/guard-task-output.mjs` as a `PreToolUse` hook on `Bash` and `Read`, with an `if` rule on each (`Bash(*.output*)`, `Read(//**/*.output)`) so Node only starts for a call that names a `.output` path. Those rules need Claude Code 2.1.176 or later to match reliably. It denies a call that names a `.output` file when that file is a symlink, which is what a background subagent, such as the one `code-review` runs, leaves in the session's `tasks/` directory. The symlink points at the subagent's JSONL transcript under `~/.claude`, so Claude Code treats any read or copy as touching a sensitive file and stops on a permission prompt, which stalls an unattended worker. The deny reason tells the agent that the report is the completion notification's text and to write that text to the scratchpad instead. Background Bash tasks write plain `.output` files, and the hook leaves those alone. It needs `node` on `PATH` and lets the call through on any input it cannot parse. It matches paths as written, so a path the shell builds (a variable, a glob, a `cd` earlier in the same command) gets through; the instruction in `pr-review` is the primary defence.

## The `pr-review-stages` workflow

`workflows/pr-review-stages.js` is a Claude Code [dynamic workflow](https://code.claude.com/docs/en/workflows#distribute-a-workflow-in-a-plugin). When the Workflow tool is listed, `review:pr-review` runs the structural brief, the three stage subagents, and the consolidation through it instead of by hand: the script holds the fan-out, every stage return is validated against a schema, the consolidation is plain JavaScript, and a run that stops part way can be relaunched in the same session, where completed agents return their saved results and the failed agent and those after it run again. `/workflows` shows its three phases, `Brief`, `Stages`, and `Consolidate`. The `code-review` pass and the merge of its report stay in the skill.

Each PR in `args` carries `headSha`, the full SHA of the commit under review. The script hands it to the brief and to every stage as the head, never the ref in `head`, which another review of the same PR can move, and prints it as that PR's `Reviewed head:` line. Each PR may also carry an `instructions` object with any of `brief`, `correctness`, `typeSafety`, `comments`, and `all`, each a non-empty string the script appends to that agent's prompt under `## Additional instructions from the caller` (`all` reaches the brief and every stage). The skill fills it from the prompt that invoked it, so a headless caller's run-specific context, such as the requirements the PR delivers, `--repo` on every `gh` call, or which refs were fetched, reaches the stages on the workflow path as it does by hand. A PR without it gets no such section. A PR may also carry `checkout`, the absolute path of a worktree or clone of that head that `pr-review` set up. The script then adds a "Checkout of the head" block to the brief and to every stage prompt, so they read and run commands there, and asks the brief agent for that directory's `HEAD`; a missing or different commit adds a roll-up line naming both SHAs. A PR may also carry `setup`, `{ kind, note }` with `kind` one of `checkout`, `worktree`, `clone` or `none`, which the script prints as `PR <n>: head setup: <kind>. <note>` in the roll-up. A PR without either gets the prompts and report it always did. For a PR set up as a clone, `base` is the SHA of the base, not `origin/<branch>`, which inside a clone is the user's local branch; the script rejects a clone with any other `base`.

When the tool is not listed, the skill's prose path runs and produces the same report shape. That is the case on other harnesses, with `disableWorkflows` or `CLAUDE_CODE_DISABLE_WORKFLOWS=1`, and on a plan where dynamic workflows are off. After `npx skills add`, which installs `skills/` only, the workflow is missing: on Claude Code the Workflow call fails with `not found` and the prose path follows.

Requirements: Claude Code 2.1.248 or later with dynamic workflows enabled. The workflows documentation names 2.1.248 for `/workflow-authoring`, the reference the script follows, and names no release for plugin `workflows/`; the plugin was verified on 2.1.289.

Permissions: an interactive session asks before the first run and offers "don't ask again for `pr-review-stages`" per project; auto mode asks on the first launch only; `claude -p` and the Agent SDK never prompt and need the allow rule `Workflow(review:pr-review-stages)`.

The stage prompts and the brief instructions live in `skills/pr-review/SKILL.md`; the script carries verbatim copies, and `scripts/review-workflow.test.ts` in this repository fails when they differ. To change step 2 or a stage prompt, edit SKILL.md first, then copy the new text into the script's template constant, escaping backslashes, backticks, and `${`.
