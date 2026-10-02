# Noppu Labs: AI Toolkit

[![tests](https://github.com/noppu-labs/ai-toolkit/actions/workflows/tests.yml/badge.svg)](https://github.com/noppu-labs/ai-toolkit/actions/workflows/tests.yml)
[![fuzz](https://github.com/noppu-labs/ai-toolkit/actions/workflows/fuzz.yml/badge.svg)](https://github.com/noppu-labs/ai-toolkit/actions/workflows/fuzz.yml)
[![build](https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml/badge.svg)](https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml)
[![attestations](https://img.shields.io/badge/releases-attested-blue?logo=github)](https://github.com/noppu-labs/ai-toolkit/attestations)

Agents and skills for agentic development in modern Laravel and React applications.

**Website:** <https://noppu-labs.github.io/ai-toolkit/>

## Secure code following best practices

[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/noppu-labs/ai-toolkit/badge)](https://scorecard.dev/viewer/?uri=github.com/noppu-labs/ai-toolkit)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/13473/badge)](https://www.bestpractices.dev/projects/13473)
[![OpenSSF Baseline](https://www.bestpractices.dev/projects/13473/baseline)](https://www.bestpractices.dev/projects/13473)
[![Known Vulnerabilities](https://snyk.io/test/github/noppu-labs/ai-toolkit/badge.svg)](https://snyk.io/test/github/noppu-labs/ai-toolkit)

> We try to bring you quality tooling but also **transparency** on what we offer and how secure it is.
> Feel free to visit the links on the badges above to check for reported vulnerabilities,
> our scores as an open source project and other security & compliance stats.

## What's inside

| Plugin | Contents |
| --- | --- |
| `laravel` | 16 backend skills, `laravel-backend-specialist` agent, 4 path-scoped rules |
| `inertia-react` | 6 frontend skills, `frontend-developer` agent, 2 path-scoped rules |
| `review` | 5 review skills for PHP, TypeScript, and Python: comment audit, writing comments, type-safety review, PR review orchestrator, PR comments |
| `investigate` | 3 skills: deterministic structural brief, two-pass module investigation, spec/ticket review |

## Install (Claude Code marketplace)

```text
/plugin marketplace add noppu-labs/ai-toolkit
/plugin install laravel@ai-toolkit
/plugin install inertia-react@ai-toolkit
/plugin install review@ai-toolkit
/plugin install investigate@ai-toolkit
/laravel:install-rules
/inertia-react:install-rules
```

Skills are namespaced after install, e.g. `laravel:laravel-dtos`, `inertia-react:shadcn`,
`review:comment-audit`, `investigate:brief`.
The `install-rules` commands copy each plugin's path-scoped rules into your project's
`.claude/rules/`. Review the copied rules afterwards and adjust any project-specific
commands (formatter invocation, npm script names) to your setup.

## Install (Vercel skills CLI)

```text
npx skills add noppu-labs/ai-toolkit/laravel
npx skills add noppu-labs/ai-toolkit/inertia-react
npx skills add noppu-labs/ai-toolkit/review
npx skills add noppu-labs/ai-toolkit/investigate
```

## Optional tooling for `investigate`

The `investigate:brief` script needs only `git` and Node 20+. When they are on `PATH` it also
uses `gitnexus` (call graph), `codegraph` (blast radius and inheritance), `ast-grep` (container
and binding patterns), `phpantom_lsp` (PHP types), and `typescript-language-server` (verified
TypeScript callers). By default it also sends each non-dev third-party package name to
context7.com to find version-matched documentation sources, anonymously unless
`CONTEXT7_API_KEY` is set; `--no-docs` disables that network call. Every missing tool is
reported under the brief's `Tools` section rather than failing the run.

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
