# AI Toolkit

[![tests](https://github.com/noppu-labs/ai-toolkit/actions/workflows/validate.yml/badge.svg)](https://github.com/noppu-labs/ai-toolkit/actions/workflows/validate.yml)
[![build](https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml/badge.svg)](https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml)
[![attestations](https://img.shields.io/badge/releases-attested-blue?logo=github)](https://github.com/noppu-labs/ai-toolkit/attestations)
[![Known Vulnerabilities](https://snyk.io/test/github/noppu-labs/ai-toolkit/badge.svg)](https://snyk.io/test/github/noppu-labs/ai-toolkit)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/noppu-labs/ai-toolkit/badge)](https://scorecard.dev/viewer/?uri=github.com/noppu-labs/ai-toolkit)

**Website:** <https://noppu-labs.github.io/ai-toolkit/>

Agents and skills for agentic development in modern Laravel and React applications.

| Plugin | Contents |
| --- | --- |
| `laravel` | 16 backend skills, `laravel-backend-specialist` agent, 4 path-scoped rules |
| `inertia-react` | 6 frontend skills, `frontend-developer` agent, 2 path-scoped rules |

## Install (Claude Code marketplace)

```text
/plugin marketplace add noppu-labs/ai-toolkit
/plugin install laravel@ai-toolkit
/plugin install inertia-react@ai-toolkit
/laravel:install-rules
/inertia-react:install-rules
```

Skills are namespaced after install, e.g. `laravel:laravel-dtos`, `inertia-react:shadcn`.
The `install-rules` commands copy each plugin's path-scoped rules into your project's
`.claude/rules/`. Review the copied rules afterwards and adjust any project-specific
commands (formatter invocation, npm script names) to your setup.

## Install (Vercel skills CLI)

```text
npx skills add noppu-labs/ai-toolkit/laravel
npx skills add noppu-labs/ai-toolkit/inertia-react
```

## Verifying releases

Every [release](https://github.com/noppu-labs/ai-toolkit/releases) ships a plugin tarball with
a GitHub [build provenance attestation](https://github.com/noppu-labs/ai-toolkit/attestations)
that proves CI built it from the tagged commit:

```sh
gh attestation verify <plugin>-<version>.tgz --repo noppu-labs/ai-toolkit
```

## Forking this repo

You can fork this repo and adapt the plugins to your own stack. If you do, follow
the [maintenance guide](docs/MAINTENANCE.md).
