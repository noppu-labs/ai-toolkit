# ADR-008: Project website generated from repo content

## Status

Accepted

## Context

The README lists the plugins, but skills are the actual product, and "16 backend skills"
tells a prospective user nothing about whether the DTO skill matches their conventions. We
wanted a browsable catalog: every plugin, every skill, with descriptions, searchable,
hosted somewhere free.

The trap in any catalog site is a second source of truth. If skill descriptions are typed
into the site by hand, they are wrong within a month. Whatever we built had to derive its
content from the same files consumers install.

## Decision

The site lives in `site/` as an npm workspace: Vite 8, React 19, TypeScript, and Tailwind
CSS 4, with Radix UI primitives and Motion for the interactive bits. It is fully static
and deploys to GitHub Pages.

The content pipeline is the important part. A build-time script,
`site/scripts/build-catalog.ts`, walks the repository and generates
`site/src/generated/catalog.json` from three inputs:

- `.claude-plugin/marketplace.json` for the plugin list,
- each plugin's `plugin.json` for name, description, and version,
- each skill's `SKILL.md` frontmatter for the per-skill name and description.

The script fails loudly on malformed input. A skill with broken frontmatter breaks the
site build (and therefore the `quality` CI check) instead of silently vanishing from the
catalog. The generator runs as a pre-script before `build`, `dev`, `test`, and
`typecheck`, so the catalog can never be stale within a command.

Deployment is a separate workflow (`deploy-pages.yml`) that builds the site on every push
to `main` and publishes `site/dist` through the official Pages actions. Site deploys are
decoupled from plugin releases: a docs fix goes live without a version bump, and a plugin
release does not depend on the site building.

Site components are tested in real Chromium via Vitest browser mode (see
[ADR-005](005-testing-strategy.md)).

## Consequences

### Positive

- The catalog cannot drift from the plugins. It is a projection of the installable files,
  regenerated on every build, and CI rejects skills the generator cannot parse. That
  turned SKILL.md frontmatter into a validated contract, which has value beyond the site.
- GitHub Pages costs nothing and needs no infrastructure. The whole site is static files
  behind a CDN.
- The workspace setup shares the root Biome config, TypeScript conventions, and Vitest
  version with the rest of the repo, so the site is not a separate codebase in spirit.

### Negative

- The site is only as informative as the frontmatter. A skill with a lazy one-line
  description gets a lazy catalog entry; the pipeline moves the writing burden, it does
  not remove it.
- Every site-related command pays the catalog generation cost up front. It is currently
  fast, but it scales with skill count.
- Pages deploys track `main`, so the site can describe an unreleased state of a plugin
  until the corresponding version is bumped. In practice the window is small; consumers
  who care about exact contents have the release tarballs.
