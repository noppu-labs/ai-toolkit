# Maintenance

Guide for maintaining this marketplace (or a fork of it): syncing vendored skills with their
upstreams, adding new skills, and hosting privately.

## Syncing vendored skills with upstream

Most skills are vendored from upstream repos and carry local customizations; the vendored
copies here are canonical. Each plugin's `skills-lock.json` records the upstream source and
two whole-directory hashes (upstream + vendored) taken at the last sync baseline.

Requires Node >= 20 and an authenticated `gh` CLI:

| Command | Purpose |
| --- | --- |
| `node scripts/skills-sync.mjs status` | Classify every skill: `up-to-date`, `upstream-updated`, `locally-modified`, `diverged`, `local`, or `fetch-error` |
| `node scripts/skills-sync.mjs diff <plugin>/<skill>` | Diff vendored copy against upstream |
| `node scripts/skills-sync.mjs pull <plugin>/<skill> [--force]` | Overwrite vendored copy from upstream (refuses if locally modified unless `--force`) |
| `node scripts/skills-sync.mjs accept <plugin>/<skill>` | Re-baseline the vendored hash after intentional local edits |
| `node scripts/skills-sync.mjs seed [<plugin>/<skill>]` | Re-baseline both hashes (all skills when no argument) |
| `node scripts/skills-sync.mjs verify` | Offline lock ↔ disk consistency check (CI gate) |

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
`node scripts/skills-sync.mjs seed <plugin>/<name>` and `verify`.

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
`node scripts/skills-sync.mjs pull <plugin>/<name> --force` (or copy the files in manually and
run `seed <plugin>/<name>`), and finish with `verify`.

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
