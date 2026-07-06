# ADR-007: Supply-chain hardening along OpenSSF guidelines

## Status

Accepted

## Context

A plugin marketplace for AI coding assistants is an attractive target. The content here
ends up inside other people's editor sessions with an agent acting on it, so a compromised
skill is closer to a compromised dependency than to a bad blog post. We decided early to
treat the repo's own security posture as a feature, and to make it externally auditable
rather than asserted.

The OpenSSF projects (Scorecard, Best Practices badge, Security Baseline) give us a
concrete, third-party-scored checklist instead of a self-assessment, so we aligned with
those rather than inventing our own bar.

## Decision

The hardening measures, most of which are visible in `.github/`:

**Workflows.** Every GitHub Action is pinned to a full commit SHA with the version in a
trailing comment; tags are mutable, SHAs are not. Workflow-level permissions default to
`contents: read` (or `{}`), and jobs that need more request it explicitly. The release
job is the only place with write access, scoped as described in
[ADR-006](006-release-automation-and-provenance.md).

**Dependencies.** Dependabot runs weekly for both `github-actions` and `npm` ecosystems.
Because actions are SHA-pinned, action updates flow through reviewable PRs like any other
dependency.

**Review.** A CODEOWNERS file routes every PR to the repository owner, with `/.github/`
listed explicitly so changes to the release and security automation always reach them.
Branch protection on `main` requires the `quality` and `tests` checks, an approving
review from a code owner, and signed commits.

**Monitoring.** The OpenSSF Scorecard workflow runs on a schedule and publishes results.
The README carries the Scorecard, Best Practices, Baseline, and Snyk badges with a note
inviting readers to check them; the point of the badges is public accountability, not
decoration.

**Artifacts.** Releases ship with build provenance attestations (ADR-006), and a
`SECURITY.md` documents how to report vulnerabilities.

## Consequences

### Positive

- The posture is verifiable from outside. A prospective consumer can check the Scorecard
  score and attestations without trusting anything we wrote.
- SHA pinning plus Dependabot closes the mutable-tag attack on CI while keeping updates
  low-effort: bumps arrive as PRs with the diff visible.
- Least-privilege tokens bound the blast radius of a compromised workflow or dependency
  to, in most jobs, read access.

### Negative

- Signed commits and required code-owner review add real friction for a small maintainer
  team, and self-review dynamics on a mostly-solo project make the review requirement
  partly ceremonial.
- SHA-pinned actions are unreadable without their comments, and the comments can lie if
  edited carelessly. Dependabot keeps both in sync, but hand edits need care.
- Badge scores create pressure to satisfy the metric as stated rather than the underlying
  risk. We try to notice when a criterion asks for paperwork rather than protection, and
  spend effort accordingly.
