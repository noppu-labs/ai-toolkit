# Contributing

AI Toolkit is a Claude Code plugin marketplace. The product is the skills, agents, and rules
under `laravel/` and `inertia-react/`; the rest of the repo is tooling that keeps vendored
skills in sync with their upstreams.

## Prerequisites

- Node.js >= 20 (CI runs on 22)
- An authenticated [`gh` CLI](https://cli.github.com/), needed only for the skill sync
  commands, which fetch upstream skill repos through the GitHub API

```sh
npm ci
```

## Before opening a pull request

Run the same checks CI runs (`.github/workflows/validate.yml`):

```sh
npm run lint                        # biome + markdownlint
npm test                            # vitest (includes fast-check property tests)
node scripts/skills-sync.mjs verify # lock ↔ disk consistency
```

`npm run lint:fix` auto-fixes most lint findings.

## Editing skills

Most skills are vendored from upstream repos, and each plugin's `skills-lock.json` records
content hashes of both the upstream and the vendored copy. If you edit a vendored skill's
files, re-baseline the lock entry afterwards or `verify` (and CI) will fail:

```sh
node scripts/skills-sync.mjs accept <plugin>/<skill>
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
