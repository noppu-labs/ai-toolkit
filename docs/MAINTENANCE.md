# Maintenance

Guide for maintaining this marketplace (or a fork of it): syncing vendored skills with their
upstreams, adding new skills, and hosting privately.

## Syncing vendored skills with upstream

Most skills are vendored from upstream repos and carry local customizations; the vendored
copies here are canonical. Each plugin's `skills-lock.json` records the upstream source and
two whole-directory hashes (upstream + vendored) taken at the last sync baseline.

Requires `npm ci` (the sync CLI runs via tsx) and an authenticated `gh` CLI:

| Command | Purpose |
| --- | --- |
| `npm run sync -- status` | Classify every skill: `up-to-date`, `upstream-updated`, `locally-modified`, `diverged`, `local`, or `fetch-error` |
| `npm run sync -- diff <plugin>/<skill>` | Diff vendored copy against upstream |
| `npm run sync -- pull <plugin>/<skill> [--force]` | Overwrite vendored copy from upstream (refuses if locally modified unless `--force`) |
| `npm run sync -- accept <plugin>/<skill>` | Re-baseline the vendored hash after intentional local edits |
| `npm run sync -- seed [<plugin>/<skill>]` | Re-baseline both hashes (all skills when no argument) |
| `npm run sync -- verify` | Offline lock ↔ disk consistency check (CI gate) |

Notes:

- `status` fetches every upstream file through the GitHub API, so a full run takes a few
  minutes. Keep it out of CI — `verify` is the fast, offline gate.
- After hand-merging upstream changes into a **diverged** skill, re-baseline BOTH hashes with
  `seed <plugin>/<skill>`. `accept` alone leaves the upstream hash stale, and a later `pull`
  would overwrite your merge.
- In a Claude Code session in this repo, the `sync-skills` skill walks the whole workflow,
  including manual 3-way merges for diverged skills.

## Adding a new skill

**Custom (no upstream):** create `<plugin>/skills/<name>/SKILL.md`, add a lock entry
`"<name>": { "sourceType": "local" }` to that plugin's `skills-lock.json`, then run
`npm run sync -- seed <plugin>/<name>` and `verify`.

**Vendored from an upstream repo:** add a lock entry with the upstream coordinates:

```json
"<name>": {
  "source": "owner/repo",
  "sourceType": "github",
  "ref": "main",
  "skillPath": "path/to/skill-dir-in-upstream"
}
```

then create the directory and fetch the content with
`npm run sync -- pull <plugin>/<name> --force` (or copy the files in manually and
run `seed <plugin>/<name>`), and finish with `verify`.

## Versioning and releasing plugin changes

Each plugin's `.claude-plugin/plugin.json` `version` is what consumers' update checks compare
against — Claude Code resolves a plugin's version from `plugin.json` first, falling back to the
marketplace entry, then the commit SHA. With an explicit version set, **installed copies only
update when that version changes**: a content change without a bump never reaches consumers.

Releases are automated by `.github/workflows/release.yml`. For any consumer-facing change
(skills, rules, agents, commands):

1. Bump the plugin's `version` in `<plugin>/.claude-plugin/plugin.json` **in the same commit**
   as the change. Use semver: patch for fixes/wording, minor for new skills or rules, major for
   removals or breaking restructures.
2. Push (or merge) to `main`. CI detects that the bumped version has no matching tag and, after
   re-running validation, does the rest:
   - creates and pushes the annotated tag `<plugin>@<version>` (e.g. `laravel@0.1.1` — plugins
     version independently, so one repo carries a tag series per plugin);
   - builds `<plugin>-<version>.tgz` from the plugin directory and signs its [build
     provenance](https://github.com/actions/attest-build-provenance) as a GitHub artifact
     attestation;
   - creates a GitHub Release on the tag (no title — the tag name is the title) with notes
     generated from the commits touching that plugin since its previous tag, and the tarball
     attached. The releases page doubles as the per-plugin changelog; the "Latest" badge simply
     marks the most recently published release across all plugins — cosmetic in a multi-plugin
     repo.
3. Optionally polish the generated notes: `gh release edit <plugin>@<version> --notes "..."`.

Anyone can verify that a downloaded tarball was built by this repo's CI from the tagged commit:

```sh
gh attestation verify <plugin>-<version>.tgz --repo noppu-labs/ai-toolkit
```

Notes:

- **Don't create `<plugin>@<version>` tags by hand.** An existing tag makes CI treat that
  version as already released and skip it. Bumping both plugins in one push releases both.
- **Individual skills are not versioned.** The plugin is the unit consumers install and update.
  Describe skill-level changes in the tag message or a GitHub Release on the tag; upstream
  provenance per skill already lives in `skills-lock.json`.
- **No marketplace-level version**, and don't set `version` on entries in
  `.claude-plugin/marketplace.json` — `plugin.json` silently takes precedence, so a marketplace
  entry version would only drift.
- To see what changed in a plugin between releases:
  `git log laravel@0.1.0..laravel@0.1.1 -- laravel/`.
- Docs-only changes to this repo (README, this file) don't touch plugin content and need no
  bump or tag.

## Hosting privately (forks)

Nothing below applies while the repo is public — public marketplaces install and update
anonymously.

If you host this marketplace (or a fork) as a **private** repo, the requirements fall on every
*consuming* machine, not just the maintainer:

- **Installing** (`/plugin marketplace add`, `/plugin install`) uses the machine's existing git
  credentials (ssh-agent, `gh auth`, or a credential helper) — usually invisible for your team.
- **Background auto-updates** run non-interactively and need `GITHUB_TOKEN` (or `GH_TOKEN`) set
  in the environment. Without it, installs still work but plugins silently stay stale until a
  manual reinstall.

The `gh` CLI requirement in the sync section above is separate: it authenticates fetches from
the *upstream skill repos* while maintaining this repo, regardless of this repo's visibility.
