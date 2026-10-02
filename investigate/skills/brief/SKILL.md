---
name: brief
description: Generate a deterministic structural brief for a path before anyone reads code, covering callers, wiring, blast radius, installed third-party versions, and version-checked doc sources. Use when asked for a brief, a blast radius, who calls this, or a pre-computation for an investigation or review; the module and spec skills call it first. Not an investigation by itself.
compatibility: Requires git and Node 20+. Optional on PATH (gitnexus, codegraph, ast-grep, phpantom_lsp, typescript-language-server); the TypeScript pass needs a tsserver-based TypeScript (6 or earlier) in the target repo. By default the doc-source gate sends the names of up to 12 third-party packages the target imports (devDependencies and composer dev packages excluded) to context7.com, anonymously unless CONTEXT7_API_KEY is set; --no-docs disables that network call. Each missing tool degrades its section and is reported under Tools.
---

# Structural brief

The brief is a deterministic pre-computation: a graph query plus a textual wiring scan, with
no LLM in the loop. Mechanism beats instruction. An agent told to be careful about callers
still fabricates and omits them; an agent handed a computed caller list has something to
check against.

It targets two distinct hallucination modes. First-party structure (who calls this, what
breaks) is covered by the graph and wiring sections. Third-party behaviour (what the
framework or library actually does) is covered by installed versions read from lockfiles and
a version gate on documentation sources. Redundant agent passes do not catch the second
mode; see [the evidence ladder](references/evidence-ladder.md), "Agreement is not evidence
for recall".

## Run it

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/brief/scripts/brief.mjs" <target-dir> [--max-symbols N] [--no-docs] [--no-lsp] [--help] \
  > "${TMPDIR:-/tmp}/brief-<module>.md"
```

- One run per target directory (a file's dirname is fine). Concatenate several runs under
  per-module headers.
- Redirect the output to a file and read the file, as above. A large brief overruns the
  harness's output cap when printed directly.
- Run in a checkout that has `vendor/` or `node_modules/` and any code-graph indexes. A bare
  worktree degrades resolved types and omits graph sections.
- Sources recognised: PHP, and JS/TS including `.mjs`, `.cjs`, `.mts`, `.cts`. Files come
  from `git ls-files` (tracked, plus untracked files that are not ignored). `vendor/`,
  `node_modules/`, dot-directories, and symlinks are skipped.
- Files named `*.test.*`, `*.spec.*`, or `*.stories.*` are always left out. The test-directory
  filter (`tests/`, `__tests__/`, `__mocks__/`) applies to paths relative to the target, so
  targeting a tests directory briefs the tests themselves.
- `--no-docs` skips the doc-source gate and its calls to context7.com; `--no-lsp` skips
  language-server resolution.
- `--max-symbols N` sets the per-symbol detail cap, 15 by default; a smaller N lowers it.
  Symbols are taken in file path order, so the cap drops whatever sorts last.
- `-h` or `--help` prints the usage line and exits 0.
- Only the files behind rendered symbols go to the language servers. The TypeScript pass
  needs a tsserver-based TypeScript install (TypeScript 6 or earlier) in the target repo.
  TypeScript 7 has no `tsserver.js`, so a TypeScript 7 repo shows
  `typescript-language-server: FAILED (…)` with the server's stated cause.
- Exit non-zero: fix the cause, or mark that module's structure UNRESOLVED. A usage error
  (unknown flag, a second path, a bad `--max-symbols`) also exits 1. Never investigate
  silently without the brief.

## Read the Tools section first

Every tool the brief used reports a status. Read these before trusting any other section.

| Status | Meaning |
| --- | --- |
| `ran`, `ran (index current)` | Section is trustworthy. The gitnexus index is current only when the indexed commit is HEAD. |
| `ran (index STALE, N commits behind)`, `ran (index STALE, indexed commit is not in HEAD's history)` | Graph data may be outdated. |
| `ran (no results)` | Tool worked and found nothing. |
| `partial (k of N files failed: …)` | The language server failed on some files. Types or callers for those files are UNRESOLVED. |
| `ran anonymously (no CONTEXT7_API_KEY)` | Doc gate ran without a key; rate limits may apply. |
| `ran (k of N lookups FAILED…)` | Some doc lookups errored. Those packages' docs are UNRESOLVED. |
| `FAILED (...)` | Tool is present but errored. Treat its section as UNRESOLVED, not empty. |
| `unavailable (<note>)`, `UNAVAILABLE (no global fetch)` | Tool could not run. Section is UNRESOLVED. |
| `not on PATH`, `no .codegraph index` | Tool absent. Section is UNRESOLVED, not empty. |
| `skipped (--no-lsp)`, `skipped (--no-docs)` | Deliberately not run. |
| `skipped (no PHP scan dirs)` | None of `app`, `config`, `routes`, `database`, `src` exists, and those are the only directories ast-grep scans. The textual wiring scan still ran. |
| `skipped (no composer.lock read)`, `skipped (no package-lock.json read)`, `skipped (no composer.lock or package-lock.json read)` | No lockfile was read for the target's sources, so its third-party imports are UNRESOLVED. pnpm, yarn, and bun lockfiles are not read. |
| `not needed (no PHP files)`, `not needed (no PHP symbols)`, `not needed (no TypeScript/JavaScript symbols)`, `not needed (no third-party imports)` | Nothing for the tool to do. |

For gitnexus, `not on PATH` means the binary is missing; an installed gitnexus whose `list`
command fails reads `FAILED (...)`. A thin section under a tool marked `not on PATH` is
absence of a tool, not absence of callers. If gitnexus reports STALE and its CLI is
available, run `gitnexus analyze` from the project root and rerun the brief.

## What each section tells you

- **Index** (a line, not a section): the gitnexus index commit and branch, `current` only
  when the indexed commit is HEAD and STALE otherwise. When gitnexus could not run it reads
  `Index: UNAVAILABLE` and the graph sections are omitted. A stale index is a confident
  wrong map.
- **Files**: the source files in scope. A note says when symbol detail was capped, and
  `(no named exports; basename used)` marks a JS/TS file whose symbol is its file name.
- **Third-party surface**: each package the target imports, with its INSTALLED version and
  where to read its source. Use these, never the manifest's caret range: `^3.1.0` is not a
  fact, `3.3.1` is. When no lockfile was read for the target's PHP or JS/TS sources, the
  section opens with an `UNRESOLVED: no <lockfile> was read` line.
- **Doc sources**: per-package context7 id and a version-alignment verdict (see below).
- **Module graph**: codegraph blast radius and inheritance edges, when a `.codegraph` index
  exists.
- **Per-symbol sections**: for each class or function in scope, resolved method types
  (language server), verified callers, graph callers (a lower bound), textual wiring grouped
  into buckets (container resolution, provider bindings, DI type-hints, other references),
  and name-collision warnings where graph resolution was ambiguous and skipped.
- **Unresolved by construction**: what no pass here can see, such as interface and
  parent-class callers, string-based dynamic usage, and third-party behaviour. Anything not
  listed in the brief is UNRESOLVED, not absent.

## Doc-source verdicts

The gate queries context7 for at most 12 packages per run: the first 12 imported non-dev
packages in name order. It compares each candidate's documented version to the installed
one. The gate decides version alignment; the reader only copies verdicts. Do not resolve
library ids yourself or judge versions: the context7 tool hides the deciding field
(`branch`), version markers hide in ids, and benchmark score is not relevance.

| Verdict | Action |
| --- | --- |
| `USE UNPINNED` | ✅. Hand over the id as-is. |
| `PIN to <id>/<ver>` | ✅. Hand over the pinned id, `<id>/<ver>`, as the fetch list prints it. |
| `NAME MISMATCH` | ⚠. Confirm it is really that package before handing it over. |
| `AHEAD` / `no version signal` | ⚠, not in the fetch list. Read installed source; if you hand the id over anyway, label claims version-unconfirmed. |
| `installed version unparsed` | ⚠. The lockfile version did not parse; compare versions by hand. |
| `STALE` / `STALE-ISH` / `pins are vX, installed is vY … do NOT pin` / `NO USABLE DOCS` | Hand over nothing; point at installed source. |
| `DIFFERENT STACK` | The docs are for another framework's adapter. Hand over nothing. |
| `no context7 match — read installed source` | context7 has no docs for it; read installed source. |
| `lookup FAILED` | That package's docs are UNRESOLVED; read installed source. |

`USE UNPINNED` and `PIN to` lines carry ✅; every other verdict carries ⚠. A package whose
best candidate is `STALE`, `pins are … do NOT pin`, `DIFFERENT STACK`, or a `NAME MISMATCH`
on anything weaker than `USE UNPINNED` also gets a `⛔ NO USABLE DOCS` line. The
**FETCH BEFORE CLAIMING** list rolls up each package's best ✅ id: the plain id for
`USE UNPINNED`, `<id>/<pin>` for `PIN to`. When nothing cleared, the list says so and tells
agents not to fetch docs for any package.

Prefer unpinned when the branch matches. A pin is a snapshot of one release and can be older
than the default branch. The gate recommends a pin only when a published version matches the
installed major and the default branch either is behind the installed major or is not a
release branch (`main`, `master`, `develop`, `dev`, `next`, `trunk`) updated within 120 days.

A `⛔` verdict is a real answer, not a failure to try. Stale docs are worse than none: given
documentation for the wrong major, an agent reports the old idiom with a citation, which
reads as verified.

Condense the verdicts of the packages you hand over into lines like these
(`investigate:module` Step 2 says which to pick):

```text
DOC SOURCES: pre-resolved and version-checked. Do not resolve your own.
- @inertiajs/react 3.3.1 → /websites/inertiajs_v3   (id pins v3 == installed)
- laravel/framework v13.17.0 → /laravel/framework   (branch 13.x == installed)
- lucide-react 1.17.0 → NAME MISMATCH on every candidate; read node_modules/ instead
```

The gate never blocks the brief. A network error, an HTTP error, or a reply without a
`results` array shows as `lookup FAILED` on that package and is not cached; the Tools line
then reads `FAILED (...)` or `ran (k of N lookups FAILED…)`. Each means UNRESOLVED: read
installed source. A reply whose result entries all lack a string `id` reads
`no context7 match` and is cached like any other answer. With `CONTEXT7_API_KEY` set, the
key is sent as `Authorization: Bearer <key>`; without it, queries are anonymous. Results
cache for 6 hours under the OS temp directory (`investigate-brief/context7`; override with
`INVESTIGATE_BRIEF_CACHE_DIR`). Never carry a doc verdict across sessions; recompute it.

## Limits of the graph

For PHP the call graph has no inheritance or interface edges and no container-resolution
edges (`resolve(Foo::class)`, `app(Foo::class)`, DI). Graph caller lists are a lower bound
and often read as misleadingly test-only. An empty caller list on a service or interface
method is unresolved. Recover wiring from the brief's textual buckets.

For reachability claims, see `${CLAUDE_PLUGIN_ROOT}/skills/module/SKILL.md`, "Step 4: Report".
For claims about how a third-party package behaves, apply [the evidence ladder](references/evidence-ladder.md).
