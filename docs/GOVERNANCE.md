# Governance

AI Toolkit is maintained by [Noppu Labs](https://noppu.com). It has one maintainer, who makes the final call on what is merged and released.

## Roles

| Role | Who | Responsibilities |
| --- | --- | --- |
| Maintainer | [@cris005](https://github.com/cris005) | Reviews and merges pull requests, triages issues, syncs the vendored skills with their upstreams, releases by merging a version bump, publishes the first version of a new npm name, answers vulnerability reports and publishes advisories, manages the repository and organization settings and the accounts listed below |
| Contributor | Anyone who opens an issue or a pull request | Follows [CONTRIBUTING.md](../CONTRIBUTING.md). Has no write access |

## Access to sensitive resources

| Resource | Who has access |
| --- | --- |
| The GitHub repository: administration, rulesets, Actions settings, write access | [@cris005](https://github.com/cris005), the only owner and member of the `noppu-labs` organization and the only account with write access or higher on the repository |
| Vulnerability reports and security advisories | [@cris005](https://github.com/cris005), as repository administrator |
| Release tags and GitHub releases | [@cris005](https://github.com/cris005), and the `release` and `backfill-release-assets` workflows through the token GitHub gives their jobs |
| The npm packages `@noppu-labs/opencode-review`, `@noppu-labs/opencode-investigate`, `@noppu-labs/opencode-toolkit-core`, `opencode-investigate` and `opencode-toolkit-core` | The `noppu` npm account, held by the maintainer alone. `release.yml` publishes through npm trusted publishing, and no npm token is stored as an Actions secret |
| The site's hosting: the Cloudflare account that builds and serves `toolkit.noppu.com` | The maintainer alone |
| The SonarCloud and Snyk accounts connected to the repository | The maintainer alone |

The organization requires two-factor authentication, and its base permission for members is read. `.github/CODEOWNERS` names the maintainer as the owner of every path. The repository's workflows have no Actions secrets: none in the repository, none in its one environment, and none shared from the organization.

## How a change reaches `main`

Two rules protect `main`.

A ruleset requires a pull request with one approving review from a code owner, signed commits, and passing `quality` and `tests` checks on a branch that is up to date. A new push dismisses earlier approvals, and the last push has to be approved by someone other than its author. The ruleset blocks deleting the branch and force-pushing to it, and it requests an automatic Copilot review of each pull request. Organization admins may bypass the ruleset when they merge a pull request, though not by pushing directly.

An older branch protection rule also requires a pull request and the `quality` and `tests` checks. It asks for no approval, and it applies to admins.

Together they mean a contributor's pull request needs the maintainer's approval, and the maintainer's own pull requests merge through the bypass without a second reviewer once `quality` and `tests` pass. The other checks (`python`, `fuzz`, CodeQL, SonarCloud, Snyk and the Cloudflare preview checks) run on every pull request and do not block a merge. As administrator, the maintainer can change both rules.

Tags and releases have no such rule: there is no tag ruleset, and immutable releases are off. [SECURITY_ASSESSMENT.md](SECURITY_ASSESSMENT.md#8-a-release-or-an-npm-package-is-not-built-from-the-reviewed-source) says what follows from that.

## Automation

GitHub Actions workflows get a read-only token by default, and a job that needs more asks for it in the workflow file. "Allow GitHub Actions to create and approve pull requests" is on, because the `opencode-sync` workflow opens a pull request. Dependabot opens pull requests, and CodeQL, SonarCloud, Snyk and Cloudflare post checks on them. None of them is on the ruleset's bypass list.
