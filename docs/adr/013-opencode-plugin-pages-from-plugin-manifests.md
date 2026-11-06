# ADR-013: OpenCode plugin pages from plugin manifests

## Status

Accepted. Builds on [ADR-012](012-astro-for-the-project-website.md) (the Astro site and its
content collections) and [ADR-007](007-supply-chain-hardening.md) (workflow hardening).

## Context

The toolkit's OpenCode plugins, `opencode-permission-reviewer` and `opencode-cache-manager`,
live in their own repositories and publish to npm from there. toolkit.noppu.com had nothing
on them, so a search for what either plugin does could not land on this site. Each plugin
should get a page of its own, plus a hub at `/opencode` that links them, so that the pages
can bring in search traffic.

The words on those pages describe the plugins, and the plugin authors know them best. They
also change with every release: a new setting, a new supported provider, a changed default.
Pages written in this repo would describe whichever release their author last read.

## Decision

### A manifest in each plugin repo

Each plugin repo keeps `docs/toolkit-page.yaml` and the images it names. The manifest holds
the page's head values, tagline, install commands, highlights, steps, requirements, FAQ and
links. Its fields, limits and text rules are in [docs/opencode-pages.md](../opencode-pages.md).
A Zod schema in `site/src/lib/opencode-schema.ts` checks every field, rejects unknown keys,
and caps the length of each text the page shows and the size of each list, so the layout
only has to fit text and lists up to known sizes.

### A sync from npm `latest`, with a lockfile

`npm run sync:opencode -w site` reads the `latest` dist-tag of each plugin's npm package and
fetches the repo's files at the tag `v<version>`: `package.json`, the manifest and its
images. It checks that `package.json` carries the expected package name and the same version
as the tag, and that each image is a permitted type, at most 1 MiB, and (for the hero image)
at least 1200 × 600. An SVG figure is rejected if it could run script or load another
document, or if a browser could decode it differently from the check: UTF-16, bytes that
aren't valid UTF-8, an XML declaration naming another encoding, or a control character other
than tab, line feed and carriage return. The files are copied to
`site/src/content/opencode/<name>/`, and
`site/opencode-lock.json` records each plugin's version, tag, commit, license and a SHA-256
hash per file.

The site builds from the committed copies and never fetches during a build. The lock names
the plugin repos, so adding a plugin is a lock entry with `repo` and `package`, followed by
a sync.

The sync follows npm `latest` because that is what a visitor can install. A page that
described the default branch would show settings the published package does not have yet.

### A daily pull request

`.github/workflows/opencode-sync.yml` runs the sync once a day and on demand, and opens a
pull request from `chore/opencode-sync` when anything changed. It authenticates with the
workflow's `GITHUB_TOKEN`, which needs no secret. GitHub holds the checks of a pull request
opened that way until a maintainer approves them in its Checks tab, so merging takes a
maintainer's look at the copy diff and the preview, in addition to green checks.

The plugin repos' files are untrusted input, so two jobs share the work. The `sync` job
fetches and parses them with a read-only token and hands the result on as artifacts. The
`pr` job holds the write token. It commits and pushes those files and posts the sync's
summary with `gh`, and it never parses or runs them. A third job, `result`, fails the run
when the sync failed for a plugin, after the other plugins' updates have reached the pull
request.

### Checks in CI

`tests.yml` runs `npm run sync:opencode -w site -- --check`. It compares each copy with the
lock's hashes, reports files and folders the lock does not list, and fails an entry that is
pinned to a ref instead of its release tag. `committed-content.test.ts` repeats the hash
comparison in the site's unit tests. Together they make the lock the only way copies change.

### Rejected

- Markdown pages written in this repo. They describe the plugin as it was when someone last
  read it, and nothing tells the plugin's author that the page went stale.
- Fetching the manifests at build time. The build would depend on GitHub and npm being
  reachable, and a plugin repo could change the deployed site between two builds of the same
  commit.
- Following each repo's default branch. The page would describe unreleased work.
- A GitHub App or personal access token for the workflow. Either is a secret to create,
  scope and rotate, and the pull request's checks would then run without anyone approving
  them. With `GITHUB_TOKEN`, the held checks put a maintainer in the loop before anything
  fetched from a plugin repo runs in CI.

## Consequences

### Positive

- Each plugin's author controls the words on its page, in the repo where the plugin changes,
  and the page tracks what was published.
- The build is offline and reproducible from the commit. Every change to a page arrives as a
  reviewable diff of the copies.
- A new plugin page needs a lock entry, a manifest in the plugin's repo and no code here.
- The workflow needs no secret, and the job that holds the write token never parses or runs
  fetched content.

### Negative

- A page-only change reaches the site only with a release. Fixing a typo in a manifest means
  publishing a patch version of the plugin.
- A page can trail a release by up to a day plus the time a maintainer takes to approve the
  checks and merge.
- Editing a copy in `site/src/content/opencode/` by hand fails CI, because the lock's hash no
  longer matches. The edit belongs in the plugin repo.
- A broken manifest upstream fails the scheduled run until the plugin publishes a fix. The
  other plugins' updates still reach the pull request, and the failed plugin keeps its last
  synced page.
- The repository setting "Allow GitHub Actions to create and approve pull requests" must stay
  on, or the `pr` job cannot open the pull request.
- Someone has to approve the held checks. A sync pull request that nobody approves keeps its
  checks waiting and stays open.
