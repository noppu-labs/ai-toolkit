# Evidence ladder for third-party claims

Rank order, highest first. A claim's label is the rung it was resolved at.

1. **Installed source** — `vendor/<pkg>` or `node_modules/<pkg>` at the version the brief
   names. Authoritative for *behaviour*: what the method returns, whether it mutates, what
   the guard actually checks. Read the body; a docblock is not the body.
2. **context7 at a gate-approved id** — authoritative for *intent and idiom*: the supported
   way to do X, what changed between majors, which API superseded which. Docs state intent
   that source alone does not reveal. Only ids the brief's doc-source gate cleared count for
   this rung; an id an agent found for itself is rung 3.
3. **Recall** — label `INFERRED FROM RECALL, not resolved`, same as any other unresolved
   claim. Never launder it into a report as fact.

## Precedence

On disagreement between rungs 1 and 2, installed source wins. context7 serves the docs for
a library version that may not be the version installed here; the code under `vendor/` or
`node_modules/` is what the application actually runs. Resolve against the real artifact,
not a description of it.

## Labels

Label every third-party behaviour claim with its rung: `vendor:<file:line>`,
`docs:<library-id>`, or `INFERRED FROM RECALL`. An unlabelled framework claim is treated as
recall. Name the version a version-dependent behaviour holds for, taken from the brief's
installed versions.

## Agreement is not evidence for recall

Two agents agreeing on a recall-labelled claim is one guess counted twice: both draw on the
same training data, so the intersection of two passes does not promote it. Promote such a
claim only by resolving it at rung 1 or 2, or carry it into the report still labelled.

## When docs are worth a call

- "Is this the right or current way?"
- "What does this option do?"
- "What changed in the new major?"
- The target uses an API whose contract is not visible from the call site.

Skip docs for pure first-party logic. Most investigations of in-repo code need zero doc
lookups, and a reflexive lookup spent on an incidental package is budget not available for
the one the question turns on.
