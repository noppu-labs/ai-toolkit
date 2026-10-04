# Contributing

AI Toolkit is a Claude Code plugin marketplace. The product is the skills, agents, and rules
under `laravel/` and `inertia-react/`; the rest of the repo is tooling that keeps vendored
skills in sync with their upstreams.

## Prerequisites

- Node.js >= 20 (CI runs on 24)
- [uv](https://docs.astral.sh/uv/getting-started/installation/), needed only for the Python
  checks on the comment-audit helper
- An authenticated [`gh` CLI](https://cli.github.com/), needed only for the skill sync
  commands, which fetch upstream skill repos through the GitHub API

```sh
npm ci
uv sync --frozen   # Python tooling venv (ruff, pyright, codespell, bandit, complexipy)
```

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/quality.yml` and `tests.yml`):

```sh
npm run lint          # biome + markdownlint
npm run lint:python   # ruff, ruff format, pyright strict at Python 3.8, codespell, bandit, complexipy
npm run typecheck     # tsc --noEmit
npm test              # vitest (includes fast-check property tests)
npm run sync -- verify # lock ↔ disk consistency
```

`npm run lint:fix` auto-fixes most lint findings; `uv run ruff check --fix && uv run ruff format`
does the same for the Python helper. The helper must keep working on Python 3.8, which CI
proves by rerunning the comment-audit suite with the helper under a 3.8 interpreter
(`uv python install 3.8` gets you one locally). Tool settings live in `pyproject.toml`.

Optionally, `uv run pre-commit install` runs the Python checks and a few file-hygiene hooks on
every commit (`.pre-commit-config.yaml`); CI is the gate either way.

## Editing skills

Most skills are vendored from upstream repos, and each plugin's `skills-lock.json` records
content hashes of both the upstream and the vendored copy. If you edit a vendored skill's
files, re-baseline the lock entry afterwards or `verify` (and CI) will fail:

```sh
npm run sync -- accept <plugin>/<skill>
```

The [maintenance guide](docs/MAINTENANCE.md) covers the full sync workflow: checking
upstreams for updates, pulling changes, merging diverged skills, and adding new ones.

## Versioning

Consumer-facing changes (skills, rules, agents, commands) must bump the affected plugin's
`version` in `<plugin>/.claude-plugin/plugin.json` **in the same commit**, because installed
copies only update when that version changes. Use semver: patch for fixes and wording, minor
for new skills or rules, major for removals or breaking restructures. CI tags and publishes
releases automatically on merge to `main`; the
[maintenance guide](docs/MAINTENANCE.md#versioning-and-releasing-plugin-changes) has the
details.

Docs-only changes (README, files under `docs/`) need no version bump.

## Conventions

- Commit messages follow the conventional-commit style used in the history
  (`fix:`, `ci:`, `docs:`, `test:`, `chore(deps):`, …).
- Repo documentation beyond the standard root files (README, LICENSE, SECURITY,
  CONTRIBUTING) lives in `docs/` to keep the root uncluttered.
- Report security issues per [SECURITY.md](SECURITY.md), not in public issues.
