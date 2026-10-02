---
name: brief
description: Generate a deterministic structural brief for a path before anyone reads code — callers, wiring, blast radius, installed third-party versions, and version-checked doc sources. Use when asked for a brief, a blast radius, who calls this, or a pre-computation for an investigation or review; the module and spec skills call it first. Not an investigation by itself.
compatibility: Requires git and Node 20+. Optional on PATH — gitnexus, codegraph, ast-grep, phpantom_lsp, typescript-language-server. By default the doc-source gate sends each non-dev third-party package name to context7.com (anonymously unless CONTEXT7_API_KEY is set); --no-docs disables that network call. Each missing tool degrades its section and is reported under Tools.
---

# Structural brief

The brief is a deterministic pre-computation: a graph query plus a textual wiring scan, with
no LLM in the loop. Mechanism beats instruction. An agent told to be careful about callers
still fabricates and omits them; an agent handed a computed caller list has something to
check against. Roughly a third to half of what a single unaided pass surfaces is
run-dependent.

It targets two distinct hallucination modes. First-party structure (who calls this, what
breaks) is covered by the graph and wiring sections. Third-party behaviour (what the
framework or library actually does) is covered by installed versions read from lockfiles and
a version gate on documentation sources. Redundant agent passes do not catch the second
mode: both share the same stale recall and agree.

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
- Sources recognised: PHP, and JS/TS including `.mjs`, `.cjs`, `.mts`, `.cts`.
- `--no-docs` skips the doc-source gate and its calls to context7.com; `--no-lsp` skips
  language-server resolution.
  `--max-symbols N` raises the per-symbol detail cap.
- Exit non-zero: fix the cause, or mark that module's structure UNRESOLVED. A usage error
  (unknown flag, a second path, a bad `--max-symbols`) also exits 1. Never investigate
  silently without the brief.

## Read the Tools section first

Every tool the brief used reports a status. Read these before trusting any other section.

| Status | Meaning |
| --- | --- |
| `ran`, `ran (index current)` | Section is trustworthy. |
| `ran (index STALE, N commits behind)` | Graph data may be outdated. |
| `ran (no results)` | Tool worked and found nothing. |
| `ran anonymously (no CONTEXT7_API_KEY)` | Doc gate ran without a key; rate limits may apply. |
| `ran (k of N lookups FAILED)` | Some doc lookups errored. Those packages' docs are UNRESOLVED. |
| `FAILED (...)` | Tool is present but errored. Treat its section as UNRESOLVED, not empty. |
| `unavailable (<note>)`, `UNAVAILABLE (no global fetch)` | Tool could not run. Section is UNRESOLVED. |
| `not on PATH`, `no .codegraph index` | Tool absent. Section is thin or missing. |
| `skipped (--no-lsp)`, `skipped (--no-docs)`, `skipped (no PHP scan dirs)` | Deliberately not run. |
| `not needed (no PHP files)`, `not needed (no TypeScript/JavaScript files)`, `not needed (no third-party imports)` | Nothing for the tool to do. |

A thin section under a tool marked `not on PATH` is absence of a tool, not absence of
callers. If gitnexus reports STALE and its CLI is available, run `gitnexus analyze` from the
project root and rerun the brief.

## What each section tells you

- **Index** — the gitnexus index commit and branch, flagged STALE when behind HEAD. A stale
  index is a confident wrong map.
- **Files** — the source files in scope. A note says when symbol detail was capped.
- **Third-party surface** — each package the target imports, with its INSTALLED version and
  where to read its source. Use these, never the manifest's caret range: `^3.1.0` is not a
  fact, `3.3.1` is.
- **Doc sources** — per-package context7 id and a version-alignment verdict (see below).
- **Module graph** — codegraph blast radius and inheritance edges, when a `.codegraph` index
  exists.
- **Per-symbol sections** — for each class or function in scope: resolved method types
  (language server), verified callers, graph callers (a lower bound), textual wiring grouped
  into buckets (container resolution, provider bindings, DI type-hints, other references),
  and name-collision warnings where graph resolution was ambiguous and skipped.
- **Unresolved by construction** — what no pass here can see: interface and parent-class
  callers, string-based dynamic usage, third-party behaviour. Anything not listed in the brief
  is UNRESOLVED, not absent.

## Doc-source verdicts

The gate queries context7 per package and compares the docs' version to the installed one.
The gate decides version alignment; the reader only copies verdicts. Do not resolve library
ids yourself or judge versions: the context7 tool hides the deciding field (`branch`), version
markers hide in ids, and benchmark score is not relevance.

| Verdict | Action |
| --- | --- |
| `USE UNPINNED` | Hand over the id as-is. |
| `PIN to <id>/<ver>` | Hand over the pinned id; the default branch is behind. |
| `NAME MISMATCH` | Confirm it is really that package before handing it over. |
| `AHEAD` / `no version signal` | Usable, but label claims version-unconfirmed. |
| `STALE` / `STALE-ISH` / `NO USABLE DOCS` | Hand over nothing; point at installed source. |
| `no context7 match — read installed source` | context7 has no docs for it; read installed source. |
| `lookup FAILED` | That package's docs are UNRESOLVED; read installed source. |

Prefer unpinned when the branch matches. A pin is a snapshot of one release and can be older
than the default branch. The gate recommends a pin only when the default branch is behind.

A `⛔` verdict is a real answer, not a failure to try. Stale docs are worse than none: given
documentation for the wrong major, an agent reports the old idiom with a citation, which
reads as verified.

Paste the verdicts into every agent prompt verbatim:

```text
DOC SOURCES — pre-resolved and version-checked. Do not resolve your own.
- @inertiajs/react 3.3.1 → /websites/inertiajs_v3   (id pins v3 == installed)
- laravel/framework v13.17.0 → /laravel/framework   (branch 13.x == installed)
- lucide-react 1.17.0 → NAME MISMATCH on every candidate; read node_modules/ instead
```

Choosing which packages need docs is still a judgment call: usually 2 to 4, the ones whose
semantics the target leans on. Most first-party work needs none.

The gate never blocks the brief. No network or an API change degrades to an UNAVAILABLE or
FAILED status, or to `lookup FAILED` on the packages it hit; each means UNRESOLVED: read
installed source. No key only means anonymous queries. Results cache
for 6 hours under the OS temp directory (`investigate-brief/context7`; override with
`INVESTIGATE_BRIEF_CACHE_DIR`). Never carry a doc verdict across sessions; recompute it.

## Three outcomes

Every claim about reachability ends in exactly one of:

- **Reachable** — cite the path that produces the state.
- **Guarded** — cite the specific code that prevents it.
- **Unresolved** — say so and name what you would need to read.

A guard you did not find is not a guard that does not exist. Never convert a failed search
into "no callers" or into a confident bug report.

For PHP the call graph has no inheritance or interface edges and no container-resolution
edges (`resolve(Foo::class)`, `app(Foo::class)`, DI). Graph caller lists are a lower bound
and often read as misleadingly test-only. An empty caller list on a service or interface
method is unresolved. Recover wiring from the brief's textual buckets.

For claims about how a third-party package behaves, apply [the evidence ladder](references/evidence-ladder.md).
