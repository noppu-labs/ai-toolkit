# Resolving types and callers

The companion to [the evidence ladder](evidence-ladder.md). The ladder covers claims about
third-party packages; this page covers first-party types and call relationships. Each tool
below applies only when it is available in the session. When it is not, fall back to reading
the definition and label the claim as the agent prompt's rules require.

## Route by the question

| Question | Reach for |
| --- | --- |
| What is the real type, or where is a symbol actually defined? | A language server that reads real source: PHPantom for PHP, the TypeScript language server for TS and JS. |
| Where does a symbol live, what touches it, what is the blast radius? | A code graph queried by name: gitnexus, codegraph. |
| Does it actually behave this way? | Tests, or a REPL against the real code. |

Pick the tool the question calls for. Running every tool as a fixed pipeline costs a lot
and does not target the failure mode. The method rules (resolve before asserting, read the
body, three outcomes) change answers far more than tool choice does.

## PHP

- On any disagreement about a type between a language server that reads real source and an
  IDE-generated stub or helper file, the language server wins. Stubs are inferred, and
  regenerating them does not fix a wrong inference. When the type matters, check the
  relation or method definition itself.
- PHPantom has no call hierarchy for PHP: `prepareCallHierarchy` fails. Use
  `findReferences` and accept the extra noise.
- The gitnexus graph has no inheritance or interface edges for PHP, and no
  container-resolution edges in any language. Graph caller lists are a lower bound, and an
  empty list on a service or interface method is unresolved, not "no callers". The brief's
  banner and its "Unresolved by construction" section state these limits, and its wiring
  scan recovers container wiring textually.

## TypeScript and JavaScript

Call hierarchy works here, so prefer `incomingCalls` over `findReferences` for "who uses
this". References also count imports and re-exports; call hierarchy gives the calling
function plus each call site. On one measured component, `findReferences` returned 24
references across 8 files against 7 actual callers.

Order of attack:

1. `documentSymbol` for the shape of the file.
2. `incomingCalls` for who uses a symbol, with exact call sites.
3. `hover` or `goToDefinition` for types and true definitions.

## Position-addressed and name-addressed tools

| Kind | Tools | Cold start |
| --- | --- | --- |
| Position-addressed | Language servers (PHPantom, the TypeScript language server) | Take a 1-based `line:character`, so they need a `documentSymbol` or a read first. `documentSymbol` at `1:1` is the cheap start, often cheaper than reading the whole file. |
| Name-addressed | Code graphs (gitnexus, codegraph), symbol search | Work cold, with no prior read. |

A resolved caller list still ends in the three-outcome rule (Reachable, Guarded,
Unresolved); see [the brief skill](../SKILL.md), "Limits of the graph".
