# ADR-005: Testing with Vitest and fast-check property tests

## Status

Accepted

## Context

The riskiest code in this repo is the skills-sync CLI. It hashes directories, parses
lockfiles, classifies sync states, and decides when it is allowed to overwrite a vendored
skill. A wrong answer does not throw; it quietly destroys someone's local edits or lets
drift pass the CI gate. Example-based tests cover the cases we thought of, which is
exactly the problem: hashing and classification bugs live in the inputs we did not think
of.

We evaluated coverage-guided fuzzing (Jazzer.js) as a proof of concept. It found nothing
the property tests had not, and it dragged in a parallel Jest-based toolchain next to
Vitest: two runners, two config dialects, two sets of transforms. For pure TypeScript
parsing and hashing logic, with no native code and no complex binary formats, the
cost-benefit did not work out, and we removed it.

The site has its own concern: components that render differently in a real browser than
in a DOM emulation.

## Decision

Vitest is the only test runner, for both the tooling and the site.

**Property-based tests** via `@fast-check/vitest` sit alongside conventional unit and
integration tests in `scripts/`. Hashing, lockfile parsing, upstream-coordinate
validation, and state classification all have properties (round-trips, invariants,
order-insensitivity) exercised with generated inputs. The run count comes from the
`FC_NUM_RUNS` environment variable through `scripts/fc-setup.ts`.

**Tiered fuzzing** keeps PR feedback fast while still going deep. A dedicated `fuzz`
workflow runs the property suite at 1,000 runs per property on every push and PR, and a
weekly scheduled job runs the same suite at 50,000 runs. The deep run costs nothing on the
PR critical path and has the whole night to find something.

**Coverage** is collected with the v8 provider and gated at 95% for statements, branches,
functions, and lines across `scripts/`. The threshold is enforced in the tests workflow,
with a coverage report commented on each PR.

**Site tests** run in real Chromium through Vitest browser mode with Playwright and
`vitest-browser-react`, not jsdom. Components render in an actual browser, and queries go
through the accessibility tree (`getByRole`, `getByText`).

Test files are co-located with their subjects (`hashing.ts` next to `hashing.test.ts`),
organized as one `describe` per exported function.

## Consequences

### Positive

- fast-check exercises inputs no one writes by hand: empty path segments, unicode
  filenames, adversarial strings in comparison logic. When a property fails, it shrinks
  the input to a minimal counterexample, which makes the bug report almost free.
- One runner means one watch mode, one coverage story, and one mental model. Removing the
  Jazzer.js experiment deleted an entire duplicate toolchain.
- The 95% gate makes coverage regressions a CI failure rather than a code-review nitpick.

### Negative

- Property tests are slower than example tests, and the fuzz suite needs a raised timeout
  even at PR run counts. The 50,000-run tier would be unbearable on the PR path, which is
  why it only runs on a schedule.
- A weekly deep-fuzz failure lands on `main` asynchronously, detached from whichever PR
  introduced it. Someone has to notice the red workflow and bisect.
- The 95% threshold occasionally forces tests for trivial branches, and property tests are
  a skill: a weak arbitrary gives the confidence of fuzzing without the coverage of it.
- fast-check explores randomly rather than being guided by coverage feedback, so it is
  weaker than a true fuzzer on deeply nested conditionals. For this codebase we judged the
  gap not worth a second toolchain; that call should be revisited if the CLI ever grows
  parsing of untrusted binary input.
