# AI Toolkit

A collection of agents and skills for agentic development for modern Laravel and React applications.

| Plugin | Contents |
| --- | --- |
| `laravel` | 16 backend skills, `laravel-backend-specialist` agent, 4 path-scoped rules |
| `inertia-react` | 6 frontend skills, `frontend-developer` agent, 2 path-scoped rules |

## Install (Claude Code marketplace)

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

These plugins can be forked and adapted to your own stack. If you fork this repo,
follow the [maintenance guide](MAINTENANCE.md).
