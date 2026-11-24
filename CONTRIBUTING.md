# Contributing

AI Toolkit is a plugin marketplace for coding agents. The product is the four plugins
(`laravel/`, `inertia-react/`, `review/` and `investigate/`) with their skills, agents, rules,
commands, scripts, hook and workflow, and the shared npm package in
`packages/opencode-toolkit-core/`. The rest of the repo is tooling: the sync CLI for vendored
skills, the tests, the release pipeline and the website in `site/`.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) shows how the parts fit together.

## Prerequisites

- Node.js >= 22.23.4, the minimum for the site's Astro build. Node 24 is recommended: CI
  runs it, and `.node-version` pins it for Cloudflare's builds.
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

## Building

Nothing that ships in a plugin is compiled. A plugin is its directory as committed: Markdown,
plus shell, Python and `.mjs` scripts that run as they are. The OpenCode packages ship
TypeScript source (`review/opencode/`, `investigate/opencode/` and
`packages/opencode-toolkit-core/`) that OpenCode loads directly. A plugin change therefore
needs only the prerequisites above and the checks in the previous section.

The website is the one part with a build step. It needs the Node.js version from the
prerequisites and the packages `npm ci` installs:

```sh
npm run build -w site   # Astro, output in site/dist
```

Cloudflare builds and deploys the site from `main`; its build settings live in the Cloudflare
account, not in this repo.

Release artifacts are produced by `.github/workflows/release.yml`. The one exception is the
first version of a new npm name, which a maintainer publishes by hand. The workflow packs
a plugin with `tar -czf <plugin>-<version>.tgz <plugin>` at the repository root, packs the
shared package the same way from `packages/`, and builds each npm package with
`npm pack --ignore-scripts` in the package's directory (`review/`, `investigate/` or
`packages/opencode-toolkit-core/`). Run `npm pack --dry-run` in one of those directories to
see what a package will contain. The
[maintenance guide](docs/MAINTENANCE.md#versioning-and-releasing-plugin-changes) covers the
rest of a release.

## Running the site

The site in `site/` is an Astro project. Start it with `npm run dev -w site`. Astro 7
detaches `astro dev` into a background process when it detects an AI coding agent on macOS
or Linux, or when you pass `--background`. Manage that server with `astro dev stop`,
`astro dev status` and `astro dev logs`, run through npm as `npm run dev -w site -- stop`
(likewise `status` and `logs`), and set `ASTRO_DEV_BACKGROUND=0` to keep the server in the
foreground. See Astro's
[background mode](https://docs.astro.build/en/guides/build-with-ai/#background-mode).

The pages under `/opencode` come from manifests in the plugin repos. The manifest format and
the sync are in [docs/opencode-pages.md](docs/opencode-pages.md).

## Dependencies

Nothing that ships in a plugin has a third-party runtime dependency. The scripts use Node's
built-in modules, bash, awk and the Python standard library, and they call tools such as
`git` from the user's `PATH`. The two OpenCode plugin packages depend on
`@noppu-labs/opencode-toolkit-core` and nothing else, and that package has no dependencies.
Everything below is tooling for this repo and for the website.

| What | Declared in | Locked by |
| --- | --- | --- |
| Lint, type-check and test tooling, and the workspaces `site` and `packages/opencode-toolkit-core` | `package.json`, `site/package.json` | `package-lock.json` at the root |
| CI-only tools (the Claude Code CLI behind `npm run plugin:validate`) | `.github/tools/package.json` | `.github/tools/package-lock.json` |
| Python tooling for the comment-audit helper | the `dev` group in `pyproject.toml` | `uv.lock` |
| Vendored skills | each plugin's `skills-lock.json`, with the upstream repository and path | the upstream commit and content hashes in the same file |
| GitHub Actions | the `uses:` lines in `.github/workflows/` | a full commit SHA on each, with the version in a comment |

The optional pre-commit hooks pin `pre-commit-hooks` by tag in `.pre-commit-config.yaml`. CI
does not run them.

A new dependency is proposed in a pull request, and the maintainer decides in review whether
to take it. The larger tool choices have ADRs: [TypeScript](docs/adr/003-typescript-for-repo-tooling.md),
[Biome and markdownlint](docs/adr/004-biome-and-markdownlint.md),
[Vitest and fast-check](docs/adr/005-testing-strategy.md) and
[Astro](docs/adr/012-astro-for-the-project-website.md). To add one:

- npm: add it to the manifest that needs it (the root for repo tooling, `site/` for the
  website, `.github/tools/` for something only CI runs), run `npm install` there, and commit
  the manifest with its lockfile. The `overrides` block in the root `package.json` raises a
  few transitive dependencies above the version their parent would install.
- Python: add it to the `dev` group in `pyproject.toml`, run `uv lock`, and commit both.
- A GitHub Action: pin it to a full commit SHA and put the version in a trailing comment.
- A vendored skill: follow [Adding a new skill](docs/MAINTENANCE.md#adding-a-new-skill).

CI installs from the lockfiles: `npm ci --ignore-scripts` for both npm manifests and
`uv sync --locked --no-build` for Python. Three things come from outside them. The pinned
`setup-node` and `setup-uv` actions provide Node 24 and uv, the `tests` workflow installs a
Python 3.8 interpreter with `uv python install`, and Playwright fetches a Chromium build for
the site's browser tests.

Dependabot keeps the dependencies current. Every week it opens pull requests for the pinned
actions, the root npm workspace, `.github/tools` and the Python tooling
(`.github/dependabot.yml`), and it opens one when a security advisory affects a dependency.
In the root workspace Vitest and Astro each have a group, the other minor and patch updates
arrive together, and the other majors arrive one per pull request. Nothing updates vendored
skills automatically: a maintainer runs `npm run sync -- status` to see which upstreams moved and
`pull` to take a change ([maintenance guide](docs/MAINTENANCE.md#syncing-vendored-skills-with-upstream)).

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

Consumer-facing changes (skills, rules, agents, commands, workflows) must bump the affected plugin's
`version` in `<plugin>/.claude-plugin/plugin.json` **in the same commit**, because installed
copies only update when that version changes. Use semver: patch for fixes and wording, minor
for new skills, rules, or workflows, major for removals or breaking restructures. CI tags and publishes
releases automatically on merge to `main`; the
[maintenance guide](docs/MAINTENANCE.md#versioning-and-releasing-plugin-changes) has the
details, including how shared npm packages under `packages/` are versioned and published.

Docs-only changes (README, files under `docs/`) need no version bump.

## Licensing your contribution

The repository is under the [MIT license](LICENSE). By opening a pull request you assert,
under section D.6 of
[GitHub's Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#6-contributions-under-repository-license)
(inbound=outbound), that you have the right to contribute the change under that license.
There is no DCO sign-off check and no CLA.

## Conventions

- Commit messages follow the conventional-commit style used in the history
  (`fix:`, `ci:`, `docs:`, `test:`, `chore(deps):`, …).
- A change to what a plugin exposes or does on a user's machine (a skill's arguments, a
  script's flags, files or network calls, the hook, the workflow, a package's exports) updates
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and, where it changes a risk,
  [docs/SECURITY_ASSESSMENT.md](docs/SECURITY_ASSESSMENT.md) in the same pull request. So does
  a change to a workflow in `.github/workflows/` or to the site's Worker. A change in who
  holds which access updates [docs/GOVERNANCE.md](docs/GOVERNANCE.md).
- Repo documentation beyond the standard root files (README, LICENSE, SECURITY,
  CONTRIBUTING) lives in `docs/` to keep the root uncluttered.
- Report security issues per [SECURITY.md](SECURITY.md), not in public issues.
