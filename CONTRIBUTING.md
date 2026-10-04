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
uv sync --frozen   # Python tooling venv
```

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/quality.yml` and `tests.yml`):

```sh
npm run lint          # biome + markdownlint
npm run lint:python   # ruff, ruff format, pyright strict, codespell, bandit, complexipy
npm run typecheck     # tsc --noEmit
npm test              # vitest (includes fast-check property tests)
npm run sync -- verify # lock ↔ disk consistency
```

`npm run lint:fix` auto-fixes most lint findings; `uv run ruff check --fix && uv run ruff format`
does the same for the Python helper. Tool settings live in `pyproject.toml`.

The helper must keep working on Python 3.8. Pyright at `pythonVersion` 3.8 catches annotations
evaluated at runtime and syntax newer than 3.8, but not stdlib APIs newer than 3.8: only the
`tests.yml` rerun of the comment-audit suite under 3.8 guards those, and only on paths the
suite runs. To run the suite on 3.8 locally, follow that step: put a `python3` shim for
`uv python find --no-project 3.8` first on `PATH` and set `REVIEW_PYTHON` to it.

```sh
uv python install 3.8
mkdir -p /tmp/py38 && ln -sf "$(uv python find --no-project 3.8)" /tmp/py38/python3
PATH="/tmp/py38:$PATH" REVIEW_PYTHON=/tmp/py38/python3 npx vitest run scripts/review-scripts.test.ts
```

Optionally, `uv run pre-commit install` runs the Python checks on every commit, plus a few
file-hygiene hooks that CI does not run (`.pre-commit-config.yaml`).

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
