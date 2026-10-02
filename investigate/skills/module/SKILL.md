---
name: module
description: Structured investigation of a service, module, or feature with a deterministic brief and two redundant parallel passes synthesised by intersection. Use when asked to investigate, audit, or deeply understand code, or when conclusions about callers, blast radius, or reachability will drive a decision. Accepts a path or a free-text subject. Not for quick single-fact lookups; for a spec or ticket use investigate:spec.
---

# Module investigation

A single pass fabricates and omits callers: roughly a third to half of what one run
surfaces is run-dependent (measured over 13 controlled runs, Aug 2026). Run two passes
with the same prompt and treat the intersection as trusted.

Redundancy does not catch third-party recall errors. Both agents share the same training
data and agree, confidently and wrongly. The brief's doc-source gate and the evidence
ladder (`${CLAUDE_PLUGIN_ROOT}/skills/brief/references/evidence-ladder.md`) cover that
mode.

## Step 0 — Resolve the target set

Resolve the argument to at most four module directories before anything else.

- **Path that exists** → that directory. A file's dirname is fine.
- **Free text** → locate the module with `git grep -lw <term>`, `codegraph explore`, or
  `gitnexus query` when available. Ask the user only if the result is genuinely
  ambiguous.
- More than four candidates: prefer the modules the subject centres on and say which
  you dropped.

## Step 1 — Generate the brief

Invoke the `investigate:brief` skill once per module directory. Concatenate the outputs
under per-module headers.

If a brief fails, that module's structure is UNRESOLVED. Say so in the report; never
investigate silently without the brief.

## Step 2 — Dispatch two agents in parallel

Build one prompt from `references/agent-prompt.md` using the **Module investigation**
question. Fill `<BRIEF>` with the concatenated briefs and `<DOC SOURCES>` with the gate's
verdict lines, copied verbatim.

Choose which packages' doc ids to hand over: the 2 to 4 whose semantics the target leans
on. Most first-party investigations need none; then write `none handed over`.

Send one message containing two Agent tool uses with identical prompts.

## Step 3 — Synthesise by intersection

- Claimed by both agents → trusted.
- Claimed by one agent → read the cited file:line and confirm, or mark it single-source.
- Disagreements are the highest-value verification targets. Resolve them by reading
  code, not by preferring the more confident phrasing.
- The intersection rule does not extend to recall-labelled framework claims. Two
  `INFERRED FROM RECALL` claims agreeing are one guess counted twice. Promote one only
  by resolving it at the installed source or a gate-approved doc id, or carry it into the
  report still labelled.

## Step 4 — Report

- Every reachability claim ends as Reachable (cite the path), Guarded (cite the guard),
  or Unresolved (name what you would need to read). Never convert a failed search into
  "no callers".
- Carry rung labels through: `vendor:<file:line>`, `node_modules:<file:line>`,
  `docs:<library-id>`, or `INFERRED FROM RECALL`.
- Pin version-dependent framework claims to the installed version named in the brief.
- A brief section is UNRESOLVED where its Tools status reads `FAILED (...)`,
  `unavailable (...)` or `UNAVAILABLE (...)`, `not on PATH`, or `no .codegraph index`,
  or where a doc lookup reads `lookup FAILED`. `ran (...)`, `skipped (...)` and
  `not needed (...)` are usable as stated.

## Cheap variant

When the user wants a quick look, run Steps 0 and 1, then investigate inline with the
brief in hand. State in the report that it was a single pass and which claims are
single-source. The evidence ladder still applies: redundancy is what you dropped, not
rigour.
