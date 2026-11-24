# Security assessment

This page lists security problems that could occur in AI Toolkit, how likely and how costly each one is, what the code and the repository settings do about it, and what remains. It looks at the software as well as the repository, because the plugins steer an agent in someone else's project.

It was last reviewed on 2026-11-24, at `laravel` 0.1.5, `inertia-react` 0.1.3, `review` 0.13.2, `investigate` 0.2.5 and `opencode-toolkit-core` 0.1.2. [ARCHITECTURE.md](ARCHITECTURE.md) describes the actors and interfaces named here. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## What is worth protecting

- The user's project and machine. The agent that reads a skill acts there with the user's permissions, and the scripts run as the user.
- What the user's code reveals. The brief script sends package names to context7.com, and `CONTEXT7_API_KEY` when it is set.
- The user's git history, which `review:comment-audit --apply` adds a commit to.
- What users install: the content on `main`, the release tarballs and the npm packages.
- The accounts that can change any of those: repository administration, the npm account and the Cloudflare account.
- A site visitor's analytics choice.

## Trust boundaries

- Plugin content is instruction, and the toolkit enforces nothing itself. The agent decides what to do with a skill, and the user's permission settings decide what the agent may run.
- Upstream skill repositories are untrusted until a maintainer has read their content in a pull request.
- The scripts trust whatever `git`, `node`, `python3` and the optional tools resolve to on `PATH`.
- A repository that someone else wrote is untrusted input to the brief script, and so is the head of a pull request under review. Its file names, contents and configuration reach the tools the script starts.
- A reply from context7.com is untrusted input that ends up in a brief an agent reads.
- A pull request to this repository is untrusted until merged, and its code runs in CI before that.
- The other plugin repositories that the `/opencode` pages are copied from are untrusted input to the `opencode-sync` workflow.
- Requests to the site's Worker come from anyone.

## Risks

### 1. Plugin content steers an agent into harming a user's project

Impact: high. Likelihood: low.

A skill, an agent file or a rule could tell an agent to delete files, weaken a check, or send data somewhere. It would take a malicious or careless change reaching `main`.

Every change reaches `main` through a pull request, and `.github/CODEOWNERS` routes all of them to the maintainer. A ruleset requires an approving code-owner review, signed commits and the `quality` and `tests` checks ([GOVERNANCE.md](GOVERNANCE.md#how-a-change-reaches-main)). `npm run sync -- verify` in `quality` fails when a skill directory no longer matches the hash in its lock entry, so skill content cannot change without the lock changing in the same diff. Nothing is fetched at install time: what a user gets is what sits in the repository.

What remains: the review is one person reading prose, and no automated check reads a skill for what it instructs. The maintainer's own pull requests merge without a second reviewer. Claude Code and `npx skills add` take content from `main`, so the release attestation is not part of that install. On the user's side the only brake is the agent's own judgement and the permissions the user has granted it.

### 2. A vendored upstream skill carries something hostile or wrong

Impact: high. Likelihood: low.

Twenty-one of the 22 skills in `laravel` and `inertia-react` are copies of skills from three public upstream repositories, with local edits. An upstream author, or someone who takes over an upstream account, could add a harmful instruction.

The vendored copy is canonical, and an upstream change arrives only when a maintainer runs `npm run sync -- pull` and opens a pull request with the result ([ADR-002](adr/002-vendored-skills-with-lockfile.md)). Each lock entry records the upstream repository, and the upstream commit and a hash of the upstream files at the last baseline. The pull request for a pull shows every line of the vendored copy that changed.

What remains: the lock tracks each upstream's `main` branch, so a pull takes whatever is there on the day. The content is long prose with code samples, and a subtle instruction could pass the maintainer's read. The vendored skill directories are excluded from the repository's Markdown lint, so no tool looks at them beyond the hash.

### 3. A program found on `PATH` is not the one the user expects

Impact: high. Likelihood: low; it takes a compromised machine or a writable directory early on `PATH`.

The brief script starts `git`, `gitnexus`, `codegraph`, `ast-grep`, `phpantom_lsp` and `typescript-language-server` by name, and the review scripts start `git`, `awk` and `python3` or whatever `REVIEW_PYTHON` names. The hook and the scripts themselves need `node` or `bash`.

Optional tools are probed with `--version` first, and a tool that is absent or fails is reported in the brief and skipped.

What remains: the scripts do not check which binary a name resolves to, and they pass the whole environment on to it. The language servers and the graph tools are third-party programs that run inside the repository with the user's permissions, and this project does not review or pin them. [Risk 11](#11-a-brief-or-a-review-runs-on-a-hostile-repository) covers a repository the user did not write.

### 4. The context7 lookup reveals something or brings something back

Impact: low to medium. Likelihood: medium, since the lookup runs by default.

The brief script sends the names of up to 12 imported packages to context7.com, one request per package. Development dependencies are left out, a scoped npm package is sent as its scope alone, and no code, path or version is sent. With `CONTEXT7_API_KEY` set, the key goes in the `Authorization` header, and an error message that would contain a key of the `ctx7sk-` form has it replaced before it is printed. A request has an 8-second timeout, a failed lookup never stops the brief, and the reply is checked for shape before use. `--no-docs` turns the lookup off, and the README, the skill and the brief's Tools section all state that it happens.

What remains: the lookup is on unless the user passes `--no-docs`, and the name of an internal package is still a name sent to a third party. The ids and titles in a reply are printed in the brief, so a reply could carry text aimed at the agent that reads it. `INVESTIGATE_BRIEF_C7_URL` sends the query and the key to whatever URL it holds, which matters to anyone whose environment another party can set. Replies are cached for six hours under a predictable directory in the temp folder and read back with a shape check only.

### 5. The task-output hook blocks or misses a call

Impact: low. Likelihood: low.

The hook can only deny. It reads the pending call from standard input, checks with `lstat` whether a `.output` path in it is a symlink, and writes nothing and calls nothing else. Input it cannot parse lets the call through. The `if` rules in `hooks.json` keep Node from starting for calls that do not name a `.output` path, and the hook has a 10-second timeout.

What remains: the hook matches paths as they are written, so a path the shell builds from a variable, a glob or an earlier `cd` gets past it. It also denies a read of any symlinked `.output` file, including one of the user's own that has nothing to do with subagents.

### 6. A review skill changes more than the user expected

Impact: medium. Likelihood: low.

`review:comment-audit --apply` edits files and commits. `review:pr-review` fetches into `refs/pr-review/<n>` and may create a worktree outside the repository.

Without `--apply`, `comment-audit` writes only its report. With it, the skill first checks that the working tree is a clean checkout of the audited head and falls back to report mode otherwise, makes one commit, never pushes, and runs `verify-comments-only.sh`, which prints every changed line that is not a comment or blank. `review:pr-comments` posts nothing. The helper scripts write no file.

What remains: these are instructions to an agent, and the agent can depart from them. `verify-comments-only.sh` judges lines by their leading marker, so it can pass a line that opens and closes a block comment and then holds code; the skill says which cases to read by eye.

### 7. A skill id collides in OpenCode

Impact: low to medium. Likelihood: low.

The loader registers a skill only when its id is not already registered, and it never replaces one. The `investigate` ids carry an `investigate-` prefix.

What remains: the `review` ids are bare names such as `pr-review`. Another plugin that registers the same id first is the one OpenCode keeps, and the user gets that plugin's skill under this one's name.

### 8. A release or an npm package is not built from the reviewed source

Impact: high. Likelihood: low.

`release.yml` is the only workflow that tags, creates releases and publishes to npm, and its `release` job runs only for a push to `main`. The workflow's token is read-only by default; the `release` job asks for `contents`, `id-token` and `attestations`, and the two publish jobs for `id-token`. Every action is pinned to a commit SHA, and dependencies are installed from lockfiles with `npm ci --ignore-scripts`. The workflows have no Actions secret to leak: npm publishing uses trusted publishing, where the job's OIDC token is the credential.

Each GitHub release carries a tarball and its Sigstore bundle, and each npm version published by the workflow carries npm provenance. Before publishing, the workflow checks that the tag still points at the commit it built, that the tarball's checksum is unchanged between jobs, and that a version already on npm is byte-identical to the tarball of its tag. Release runs are serialized.

What remains:

- One person can merge to `main`, and whoever can merge controls the release. As organization admin the maintainer can bypass the ruleset when merging a pull request, so their own changes merge without a review. The `quality` and `tests` checks still apply to them through a branch protection rule that binds admins, and an admin can change both rules.
- There is no tag ruleset and immutable releases are off. Anyone with write access can move or delete a `<name>@<version>` tag or replace a release's files. Today that is the maintainer and the `release` job's token. A moved tag is caught at npm, where a published version cannot be replaced, and by `gh attestation verify`, which fails for a file no workflow in this repository attested.
- A compromised step inside the `release` job would hold a token that can push tags and edit releases. That job runs the pinned actions, the repository's own tooling and the Claude Code CLI used for `plugin validate`. `backfill-release-assets.yml`, which is run by hand, holds the same permissions and can replace a release's files.
- The npm trusted publisher entries name the repository and the workflow file, with no environment ([MAINTENANCE.md](MAINTENANCE.md#versioning-and-releasing-plugin-changes)). A [trusted publisher](https://docs.npmjs.com/trusted-publishers/) has no field for a branch, and `gh attestation verify --repo` accepts an attestation from any workflow in the repository, so write access to the repository is enough to publish or attest from a branch.
- Some artifacts carry weaker evidence. The five earliest releases (`laravel` 0.1.0 to 0.1.2 and `inertia-react` 0.1.0 and 0.1.1) were attested later by `backfill-release-assets.yml`, which proves that workflow built them from the tag and nothing about the original release. These npm versions have no provenance: the first version of each scoped package, which a maintainer publishes by hand before trusted publishing can be set up for the name, and `0.0.0-stage` and `0.0.1` of each unscoped one.
- The unscoped npm packages are repacked from the scoped tarball with the name changed, so their bytes differ from the tarball the smoke test installed.
- The pinning of actions is a convention kept by review and Dependabot. The repository's Actions settings allow any action and do not require a SHA.

### 9. CI runs something it should not

Impact: medium to high. Likelihood: low.

A pull request's code runs in `quality`, `tests` and `fuzz`. Those workflows use the `pull_request` trigger and no workflow uses `pull_request_target`. `preview-checks` runs from the default branch, checks out the default branch's tests and never the pull request's code, and takes only a validated hostname label from the event. `opencode-sync` splits its work in two jobs: one parses the other repositories' files with a read-only token and hands the result over as an artifact, and the job with the write token commits those files without parsing or running them.

What remains: "Allow GitHub Actions to create and approve pull requests" is on, because `opencode-sync` opens a pull request. A workflow token with `pull-requests: write` could therefore approve a pull request, though it is not a code owner and its approval does not satisfy the ruleset. The pages `opencode-sync` copies become site content once a maintainer merges its pull request, and the diff of that pull request is the only review they get. CodeQL, SonarCloud, Snyk and `fuzz` do not block a merge, so a finding there is acted on only when someone reads it.

### 10. The site or its Worker is misused

Impact: low. Likelihood: low.

The Worker has no secret, no database and no binding other than the static assets. `/api/consent` accepts only `POST`, requires an `Origin` header equal to its own origin, accepts three fixed values and answers with a cookie that holds one of them. `/api/consent-mode` asks first whenever the visitor's country is missing or unknown. `/api/badges/npm-downloads` requests a fixed list of URLs at npm and caches the answer at the edge for six hours. The Worker's code is held to the same coverage threshold as the repository's scripts.

What remains: Cloudflare builds and deploys every push to `main` with no approval step in between, and the hosting configuration lives in a Cloudflare account that one person holds. While npm's API is failing, an uncached badge request repeats the calls to npm. [ADR-014](adr/014-site-analytics-behind-consent.md) and [ADR-015](adr/015-opt-out-analytics-outside-europe.md) cover when the site's pages load Google Analytics.

### 11. A brief or a review runs on a hostile repository

Impact: high, because whatever runs does so as the user. Likelihood: low on the user's own projects, medium for anyone who runs a brief on a repository they did not write or reviews pull requests from people they do not know.

The brief script reads a path in a repository and starts `git` inside it, along with `ast-grep`, `gitnexus`, `codegraph`, `phpantom_lsp` and `typescript-language-server` when they are installed. `investigate:deep` and `investigate:spec` run the script first. `review:pr-review` runs it on a checkout of the pull request's head, so the pull request's author chooses what the script reads. The stage instructions of `review:pr-review` also allow the review agents to run the project's tests and linters, which is code from the pull request.

Through `investigate` 0.2.3, a file name in the target repository could reach `git`, `gitnexus` and `codegraph` as a command-line option, and git has an option that runs a command. Since 0.2.4 the script takes a symbol name from a file name only when the name is an identifier, and it passes every name to those tools as a search pattern or after `--`. Since 0.2.5 the script refuses a target that is inside a git directory, and it makes that check itself as well as asking git to make one. The caller searches in `review:pr-review` and `review:correctness-review` pass a name to `git grep` as a search pattern since `review` 0.13.2. The script starts each tool with an argument list and no shell, rejects a target that begins with a dash, and skips symbolic links when it reads source files. `--no-lsp` leaves the language servers out.

What remains: the brief script is not hardened against a hostile repository. Every tool it starts runs inside the target with the user's permissions, and some of them act on configuration and code they find there. This project does not review those tools or pin their versions, and nothing in the toolkit sandboxes the script, the agents or the tests an agent runs. Run a brief or a review of a repository or pull request from an unknown author in a container or another disposable environment, without credentials the work does not need.
