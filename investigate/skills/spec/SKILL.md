---
name: spec
description: Claim-by-claim review of a spec, ticket, plan, or design document against the codebase, using a deterministic brief and two redundant passes. Use when asked to review a spec or ticket against the code, check whether a plan's assumptions hold, or find the callers a proposed change forgot. Accepts a file path, a ticket or document id, or pasted text.
---

# Spec review

A spec is a set of claims about code. Each claim is CORRECT, WRONG, or UNVERIFIABLE
against what the code does today. The brief also exposes the callers the spec never
mentions, which is where most spec errors hide.

Redundancy and the intersection rule work as in `investigate:deep`. Read that skill
for the reasoning; this one covers only what differs.

## Step 0: Obtain the document

- **Path that exists** → read it in full.
- **Ticket or document id** → fetch it through whatever ticket or document tools the
  session has. Jira through the Atlassian tools is the common case; use a
  project-specific MCP server if one is configured. Include description, acceptance
  criteria, and linked or child items that carry requirements.
- **Anything else** → ask the user to paste the text.

Never proceed from a title alone. If the fetch fails or returns a stub, say so and ask
for the text.

## Step 1: Resolve the target set

Extract every file, class, and module the document references or proposes to change.

- Map each class to its module directory: `git grep -lw <ClassName>` to find the
  definition, then take the service or feature directory that contains it.
- Prefer modules the spec CHANGES over modules it merely mentions.
- Dedupe to at most about four. Say which you dropped.

## Step 2: Generate the brief

Invoke the `investigate:brief` skill once per module directory and concatenate the
outputs under per-module headers, as in `investigate:deep` Step 1.

If a brief fails, that module's structure is UNRESOLVED. Say so in the report; never
review silently without the brief.

## Step 3: Dispatch two agents in parallel

Build one prompt from `${CLAUDE_PLUGIN_ROOT}/skills/deep/references/agent-prompt.md`
using the **Spec review** question.

That question has its own nested slot. Fill `<SPEC TEXT>` with the document text,
verbatim and unabridged, first. Then paste the completed question into the outer
prompt's `<QUESTION>` slot. Fill `<BRIEF>` and `<DOC SOURCES>` as `investigate:deep`
Step 2 describes.

Send one message containing two Agent tool uses with identical prompts.

## Step 4: Synthesise and report

Apply the intersection rule from `investigate:deep` Step 3.

Organise the report by spec claim, not by agent:

1. **Claims**: each claim quoted or paraphrased closely, then its verdict (CORRECT,
   WRONG, UNVERIFIABLE) and the citation. Give a path-and-line for WRONG and CORRECT
   verdicts; name what is missing for UNVERIFIABLE.
2. **Risks in touched modules**: gotchas, hidden side effects, and Unresolved items.
3. **Callers the spec does not mention**: the unmentioned blast radius, each caller
   confirmed at file:line, with its reachability outcome (Reachable, Guarded, or
   Unresolved).

Single-source claims and `INFERRED FROM RECALL` claims stay labelled through to the
report. Treat each brief section as its Tools status says; see
`${CLAUDE_PLUGIN_ROOT}/skills/brief/SKILL.md`, "Read the Tools section first".
