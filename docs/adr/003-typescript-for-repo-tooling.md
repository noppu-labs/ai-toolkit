# ADR-003: TypeScript with maximum strictness for repo tooling

## Status

Accepted

## Context

The repo's tooling (the skills-sync CLI, the site's catalog generator, test helpers)
started life as plain Node.js scripts. That was fine while the sync script was a hundred
lines. It stopped being fine once the CLI grew a lockfile format, six subcommands, GitHub
API calls, and a test suite: the code was full of implicit shapes (lock entries, upstream
coordinates, classification states) that only existed in the author's head.

The question was not really "TypeScript or not" but how strict to go and whether to add a
build step.

## Decision

All repo tooling is TypeScript, executed directly with `tsx`. There is no build output;
`tsc --noEmit` runs as a typecheck gate in CI and nothing else. `npm run sync` is just
`tsx scripts/sync.ts`.

The root `tsconfig.json` turns on every strictness flag TypeScript currently offers on top
of `strict`:

- `noUncheckedIndexedAccess`, so index and record lookups are `T | undefined` until proven
  otherwise. This matters a lot in the sync CLI, which is mostly lookups into parsed JSON.
- `exactOptionalPropertyTypes`, `noImplicitReturns`, `noFallthroughCasesInSwitch`,
  `noUnusedLocals`, `noUnusedParameters`.
- `verbatimModuleSyntax` and `isolatedModules`, keeping type imports explicit and every
  file independently transpilable (which is also what `tsx` needs).

Target and lib are `es2025` with `nodenext` module resolution, matching the Node 24
runtime CI uses. We raise the target whenever the runtime supports it rather than
compiling down.

Domain shapes live in real types (`scripts/skills-sync/types.ts` defines `LockFile`,
`LockEntry`, `SyncState`, and friends), and the classification logic returns a closed
union instead of ad-hoc strings.

One deliberate house rule: when a lint or type rule fires on code that is actually fine,
we annotate the code to satisfy the rule instead of disabling the rule. Rule suppressions
spread; explicit annotations stay local.

## Consequences

### Positive

- The migration forced every "this key is definitely there" assumption in the lockfile
  handling into an explicit check, since `noUncheckedIndexedAccess` refuses to let indexed
  access through unguarded.
- No build step means no `dist/` to keep in sync, no source maps, and stack traces that
  point at the file you edit.
- The tooling and the site share one language and one set of conventions, so there is no
  context switch between "scripts code" and "app code".

### Negative

- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` make some code noticeably
  more verbose. Guards and narrowing show up where plain JS would just chain and hope.
- `tsx` is a runtime dependency for every script invocation. It is fast, but it is one
  more tool in the chain, and contributors cannot run the CLI with bare `node`.
- Raising the compile target with each Node upgrade means the scripts are tied to a recent
  Node. That is acceptable for repo-internal tooling; it would not be for shipped code.
