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

## Install (Vercel skills CLI)

```
npx skills add noppu-labs/ai-toolkit/laravel
npx skills add noppu-labs/ai-toolkit/inertia-react
```

## Forking this repo

The plugins are meant to be forked and adapted to your own stack. If you fork this repo —
especially as a private one — follow the [maintenance guide](MAINTENANCE.md): it covers syncing
vendored skills with their upstreams, adding new skills, and the credential requirements for
private hosting.
