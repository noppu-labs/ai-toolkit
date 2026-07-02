# ai-toolkit

Claude Code plugin marketplace for the Noppu stack (Laravel 13 + Inertia v3 + React 19 + TypeScript).

| Plugin | Contents |
| --- | --- |
| `laravel` | 16 backend skills, `laravel-backend-specialist` agent, 4 path-scoped rules |
| `inertia-react` | 6 frontend skills, `frontend-developer` agent, 2 path-scoped rules |

## Install (Claude Code)

```
/plugin marketplace add noppu-labs/ai-toolkit
/plugin install laravel@ai-toolkit
/plugin install inertia-react@ai-toolkit
/laravel:install-rules
/inertia-react:install-rules
```

Skills are namespaced after install, e.g. `laravel:laravel-dtos`, `inertia-react:shadcn`.
The `install-rules` commands copy each plugin's path-scoped rules into your project's
`.claude/rules/` — review the copied rules afterwards and adjust any project-specific
commands (formatter invocation, npm script names) to your setup.

**Private repo note:** installing uses your existing git credentials; plugin **auto-updates**
additionally require `GITHUB_TOKEN` (or `GH_TOKEN`) to be set in your environment.

## Install (Vercel skills CLI)

```
npx skills add noppu-labs/ai-toolkit/laravel
npx skills add noppu-labs/ai-toolkit/inertia-react
```

## Maintenance: syncing vendored skills with upstream

Most skills are vendored from upstream repos and carry local customizations; the vendored
copies here are canonical. Each plugin's `skills-lock.json` records the upstream source and
two whole-directory hashes (upstream + vendored) taken at the last sync baseline.

Requires Node >= 20 and an authenticated `gh` CLI:

| Command | Purpose |
| --- | --- |
| `node scripts/skills-sync.mjs status` | Classify every skill: `up-to-date`, `upstream-updated`, `locally-modified`, `diverged`, `local`, or `fetch-error` |
| `node scripts/skills-sync.mjs diff <plugin>/<skill>` | Diff vendored copy against upstream |
| `node scripts/skills-sync.mjs pull <plugin>/<skill> [--force]` | Overwrite vendored copy from upstream (refuses if locally modified unless `--force`) |
| `node scripts/skills-sync.mjs accept <plugin>/<skill>` | Re-baseline the vendored hash after intentional local edits |
| `node scripts/skills-sync.mjs seed [<plugin>/<skill>]` | Re-baseline both hashes (all skills when no argument) |
| `node scripts/skills-sync.mjs verify` | Offline lock ↔ disk consistency check (CI gate) |

In a Claude Code session in this repo, the `sync-skills` skill walks the whole workflow,
including manual 3-way merges for diverged skills.
