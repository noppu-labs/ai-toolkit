---
name: writing-comments
description: What belongs in a code comment and what to cut. Use when writing comments or docblocks, trimming a diff before opening a PR, or reviewing comments in someone else's change.
---

# Writing Comments

Document the why. A comment earns its place only when no name, type, or signature can carry it.

This is not "self-documenting code needs no comments". A style guide that says to extract a commented block into a named method is talking about comments that explain what code does. A method name can absorb a what. It cannot absorb a why that lives outside the file: an upstream schema, a window between two deploys, a library default, a domain judgement.

So: **if the comment would still be true after the code was rewritten a different way, it is a why**. Keep it, and move it to the smallest scope it explains. **If rewriting the code would make the comment false, it is a what**. Extract, name it, delete the comment.

Comment syntax (`//` versus `/* */`, docblock markers) is the consuming project's concern. The `laravel` and `inertia-react` plugins in this marketplace ship rules for it. This skill is about content.

## Applies to

- PHP
- TypeScript
- JSX, inside `{/* */}`
- GraphQL schema descriptions, inside `"""`
- Storybook story names
- Pest and Vitest test names
- Markdown READMEs

## Style

Comments and any report written about them follow [references/style.md](references/style.md).

## Core Concepts

**[deletion-patterns.md](references/deletion-patterns.md)** - Nine shapes that get cut:

- Restating the signature, the return type, or the guard on the next line
- Commit-message-in-a-comment: "this replaced", "now", "used to", "went with it"
- Rejected-alternative essays, for alternatives nobody would reach for
- The same fact stated at two sites
- Framing sentences that open a block and carry nothing
- The extraction inventory, every piece of a split describing the split

**[what-survives.md](references/what-survives.md)** - What no name can carry:

- Contracts with external systems, deploy skew, ordering constraints
- Gotchas that make correct code look wrong
- Domain, legal, and product reasons
- Tripwires, comments whose job is to make a future edit fail
- Why code is absent, when analysis or an upstream guarantee proves it

## Patterns

Prefer these three moves over deletion. Each keeps the reason and drops the prose.

**Migrate it to where it is verified.** A rationale about behaviour belongs on the test that guards that behaviour, not on the code. Relocate before you delete:

```php
/* Cut from ConsentController::show(), kept on the test that fails if it regresses: */
/*
 * toJourneyContext() resolves current() itself, so show() reading the id off
 * the returned context is the whole journey resolution for the page. Asserted
 * against the resolver rather than the upstream lookup because
 * MemoizingAccountLookup is scoped: a duplicate current() would hit the
 * memo and be invisible at the lookup, while still re-scanning the collection.
 */
```

**Demote it to the right altitude.** A class docblock explaining one property belongs on that property:

```php
/* Carries only the cleaned value: exposing the raw nameReport alongside it would invite the wrong one being rendered. */
#[WithCast(DisplayProductNameCast::class)]
public readonly string $productName,
```

**Lead with the imperative.** When a comment exists to stop a future edit, the instruction goes first and the reasoning second. Write `rehype-raw must never be added here.` before the explanation, not after it. A rejected alternative survives when someone could still reach for it: `Not final: ... Mockery cannot mock a final class`. The test is "could a future edit do this?", not "is it a comparison?"

**Name a role, not a class.** Comments rot at their proper nouns. `the envelope reader fails the read closed` survives a refactor that `UpstreamHistoryService resolves it with tryFrom()` does not, and a comment describing a *property* (`the throwing internal read`) can even survive the code moving away and back. Name the class only where a reader needs to go there next, and prefer the behaviour to the location everywhere else.

Drop whole paragraphs before reaching for individual words, then rewrite what survives rather than trimming it. Let a surviving one-liner run past the normal wrap width instead of reflowing it into a block.
