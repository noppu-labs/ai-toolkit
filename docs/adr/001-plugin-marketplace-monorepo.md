# ADR-001: Single-repo plugin marketplace

## Status

Accepted

## Context

We maintain a set of Claude Code skills, agents, and path-scoped rules for our Laravel and
React work, and we want to reuse them across projects and share them publicly. There were a
few ways to package this:

- One repository per plugin, each installed separately.
- Copying skill files into every consuming project and keeping them in sync by hand.
- One repository that acts as a Claude Code plugin marketplace, hosting multiple plugins.

Separate repos would mean duplicated CI, duplicated tooling, and duplicated release
machinery for what is currently two plugins maintained by the same person. Copy-paste
distribution is how this content started out, and drift between copies was the main pain
that motivated extracting it in the first place.

## Decision

This repository is a Claude Code plugin marketplace. `.claude-plugin/marketplace.json`
lists the plugins, and each plugin lives in its own top-level directory:

```text
laravel/
├── .claude-plugin/plugin.json   # name, description, semver version
├── agents/
├── commands/
├── rules/
├── skills/
└── skills-lock.json

inertia-react/
└── (same layout)
```

Consumers install straight from GitHub:

```text
/plugin marketplace add noppu-labs/ai-toolkit
/plugin install laravel@ai-toolkit
```

The same directories also work with the Vercel skills CLI
(`npx skills add noppu-labs/ai-toolkit/laravel`), so we get a second distribution channel
without maintaining a second artifact.

Plugins version independently. Each `plugin.json` carries its own semver version, and
Claude Code resolves a plugin's version from `plugin.json` first, then the marketplace
entry, then the commit SHA. Because we set explicit versions, installed copies only update
when that version changes. Git tags are namespaced per plugin (`laravel@0.1.3`,
`inertia-react@0.1.1`), so one repo carries a tag series per plugin.

## Consequences

### Positive

- One CI pipeline, one lint config, one test suite, and one sync tool cover every plugin.
- Cross-plugin changes (a rule that touches both stacks, a shared convention) land in a
  single PR instead of a coordinated release across repos.
- Adding a plugin is a directory plus a `marketplace.json` entry, not a new repository.

### Negative

- A content change without a version bump never reaches consumers. This is easy to forget,
  and nothing in the repo physically prevents it. The release workflow (see
  [ADR-006](006-release-automation-and-provenance.md)) only fires when `plugin.json`
  changes, so the failure mode is silence, not an error.
- The "Latest" release badge on GitHub marks the most recently published release across all
  plugins, which is meaningless in a multi-plugin repo. We treat it as cosmetic.
- Repo-level concerns (CI budget, branch protection, issue triage) are shared, so a noisy
  plugin can slow down work on a quiet one.

### Mitigations

- [docs/MAINTENANCE.md](../MAINTENANCE.md) spells out the bump-in-the-same-commit rule and
  the semver policy, and PR review checks for it.
