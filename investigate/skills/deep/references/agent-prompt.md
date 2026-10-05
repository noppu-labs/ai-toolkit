# Investigation agent prompt

Paste the whole block below into each agent, filling every `<SLOT>`. Both agents get the
identical text. `<BRIEF>` is the concatenated brief output, `<DOC SOURCES>` the condensed
verdict lines for the packages handed over (or `none handed over`), `<QUESTION>` one of the variants further down.

````markdown
```text
PRE-COMPUTED STRUCTURAL BRIEF: trust this over recall; anything not listed is UNRESOLVED, not absent.

<BRIEF>

DOC SOURCES: pre-resolved and version-checked against what is installed. Do not call
resolve-library-id yourself and do not substitute an id you prefer. A package listed ⛔ has no
usable docs: read its installed source. Installed source outranks docs on any disagreement.

<DOC SOURCES>

QUESTION

<QUESTION>

RULES
- Every caller or blast-radius claim cites either the brief or a file:line you read this run.
- Every claim about how a third-party package behaves carries the rung it was resolved at:
  `vendor:<file:line>` or `node_modules:<file:line>`, `docs:<library-id>`, or `INFERRED FROM RECALL`.
  An unlabelled framework claim is treated as recall.
- Read the body of any function you make a claim about. A name, signature, or grep hit is not evidence.
- Three outcomes only: Reachable (cite the path), Guarded (cite the guard), Unresolved (say what you
  would need to read). Never convert a failed search into "no callers".
- If your harness offers SendMessage, also send the report to the orchestrator; always return it as your final text.
```
````

## Question variants

### Module investigation

```text
Investigate the module(s) named in the brief and produce a six-section report:

1. PURPOSE: what the module is for, in your own words, grounded in code you read.
2. ENTRY POINTS: routes, commands, jobs, listeners, public methods; cite file:line.
3. CALLERS: who invokes the entry points. Start from the brief's verified callers and
   wiring buckets; add only callers you confirm by reading file:line. State which callers
   are unresolved (interface or parent-class dispatch, string-based dynamic usage).
4. DEPENDENCIES: first-party modules and third-party packages it relies on. Give the
   installed version from the brief for each package.
5. TYPES THAT MATTER: the types, DTOs, models, and enums whose shape drives behaviour;
   cardinality and nullability resolved from source, not from names.
6. GOTCHAS: non-obvious behaviour, side effects hidden in bodies, ordering or
   timing assumptions, and anything labelled Unresolved with what you would need to read.
```

### Spec review

```text
Review the spec below against the code.

SPEC (verbatim):
<SPEC TEXT>

For every change or assumption the spec states, give one verdict:
- CORRECT: cite the code that confirms it.
- WRONG: cite the code that contradicts it.
- UNVERIFIABLE: say what is missing.

Then:
1. RISKS IN TOUCHED MODULES: gotchas, side effects, and Unresolved items in the modules
   the spec changes.
2. IMPACTED CALLERS THE SPEC DOES NOT MENTION: use the brief's wiring section and
   verified callers; confirm each by reading file:line.
```
