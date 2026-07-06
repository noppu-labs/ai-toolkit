# ADR-004: Biome and markdownlint, with no overrides

## Status

Accepted

## Context

This repo is an unusual mix: the bulk of the content is Markdown (skills, rules, agent
definitions), with TypeScript tooling around it and a React site in a workspace. We wanted
linting and formatting for both halves, fast enough to run on every PR, without the
ESLint-plus-Prettier constellation of configs and peer dependencies.

We also had a history problem to avoid repeating. Early on, the Biome config accumulated
per-path overrides that relaxed rules for whichever directory was noisy that week. The
overrides made every rule's effective strength depend on where the file lived, which
defeats the point of having rules.

## Decision

Two linters, one config file each:

- **Biome** covers JavaScript, TypeScript, and CSS: linting, formatting, and import
  organizing in a single tool. CI runs `biome ci .` in the quality workflow.
- **markdownlint-cli2** covers all Markdown, which in this repo means most of the product.

The Biome config starts from the recommended preset and opts into stricter rules on top:
the react and test domains set to "all", a cognitive-complexity ceiling of 10, secret
detection, `noAwaitInLoops`, `noBarrelFile`, `noEnum`, `noHexColors`, and a handful of
nursery rules such as `useSortedClasses` and `useExplicitType`. A single rule
(`useExpect`) is switched off; everything else runs at the preset level or stricter.

There are no path overrides. The same rules apply to the sync CLI, the test helpers, and
the site. When a rule fires, we fix the code or annotate the specific site; we do not
carve out a directory. The single root config also covers the `site` workspace, so the two
package.json trees share one style.

## Consequences

### Positive

- The whole lint-and-format step is two commands and runs in seconds, including CSS and
  Tailwind class sorting.
- "Fix the violation" being the only escape hatch keeps the codebase honest. Removing the
  accumulated overrides forced a cleanup pass, and the code came out simpler.
- Contributors get one formatter with no interplay questions. `npm run lint:fix` settles
  everything Biome and markdownlint can settle.

### Negative

- Nursery rules are explicitly unstable. A Biome upgrade can rename them, change their
  behavior, or promote them with different defaults, so version bumps occasionally need
  config attention.
- Biome's rule set is not a superset of ESLint's. A few ecosystem-specific checks we might
  want have no Biome equivalent yet, and we live without them.
- markdownlint's opinions occasionally fight with what a skill file needs (long
  reference-style lines, unusual heading patterns), and satisfying it takes a little
  formatting care in prose-heavy files.
