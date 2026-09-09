# Deletion Patterns

Nine recurring shapes, every example taken from one cleanup across eight commits, none of which changed a single line of code. Across all twenty-four files, file shrinkage equalled comment shrinkage exactly.

## A. Restating the signature

The comment says what the name, the parameter list, or the return type already says.

```php
/** The consent document for a journey, or null when there is nothing to show. */
public function contentFor(string $journeyId): ?ConsentContentDto
```

```php
/* Above a ?ConsentContentDto return: */
 * The upstream API's answer to the consent document lookup, or null when the
 * upstream service confirms the journey's product has no seeded content.
```

```tsx
/* Above export function ConsentDocument: */
 * The document the account holder is agreeing to, above the signature form.
```

A nullable return type already announces that null is possible. Spend the comment on *which* null it is, or write nothing.

## B. Commit-message-in-a-comment

History that only parses against the previous diff. Tells: "this replaced", "now", "the old", "used to", "went with it", "the reason X could go".

```php
 * the same "degrade, don't cache" signal the hand-written factory this replaced used to raise.

 * The reason the hand-written factory could go: spatie reads the `array<int,
 * X>` docblocks and builds the nested DTOs itself.
```

```tsx
/* The body is markdown now, so the structure comes from the copy itself. */
```

The reader has the current file, not the diff. Put this in the commit message, where it is addressed to someone reading history.

## C. Rejected-alternative essays

Defending the design against options nobody would reach for.

```php
 * A cast rather than a named constructor on ConsentContentDto: the rest of that
 * DTO hydrates from the upstream payload with no help at all...

 * One public method rather than the throwing/degrading pair
 * UpstreamConsentService::find() and statusFor() form...
```

**The nuance that matters:** a rejected alternative *survives* when the alternative is a live trap a future edit could still fall into.

```tsx
 * rehype-raw must never be added here.
```

```php
/**
 * Not final: the ConsentController tests container-mock this class, and
 * Mockery cannot mock a final class, matching every other upstream service.
 */

 * The `v2` suffix discards entries written before the status nested under
 * `status.partner`; reading one makes find() 404 for the cache TTL. Keep it.
```

Ask "could a future edit do this?", not "is this a comparison?".

## D. The same fact at two sites

Keep it where the decision lives; cut it where the code merely consumes it.

- `multiple` explained in both `accordion.tsx` (the wrapper that chooses not to default it) and `ConsentDocument.tsx` (the call site), kept at the wrapper.
- The two-cache-key rationale in a class docblock and on `getContentCacheKey()`, kept on the method that builds the key.
- `rel` and `window.opener` in both the component and its test, reduced to one site.
- The deferred-group and "null means nothing to display" explanation in both `ConsentController::show()` (PHP) and `Consent.tsx` (the props that consume it), kept client-side, where the branch on null lives.

That last one crosses the language boundary. Before writing a fact in PHP, check whether the React file consuming it already owns that fact, and the reverse.

## E. Narrating the guard on the next line

```php
 * A non-string is handed back untouched rather than coerced or nulled...
if (! is_string($value)) {
    return $value;
}
```

```php
 * No empty-result guard is needed: the pattern requires whitespace before the
 * suffix and the subject is trimmed first...
```

The second is a comment about *absent* code that the regex and the `trim()` two lines up already prove. Absent-code comments survive only when something non-local proves the absence is safe, see `what-survives.md`.

## F. Framing sentences

Almost always the first line of a block. Deleting it loses nothing. This is the single most common edit in the set.

```text
 * The statements the account holder ticks before the form will submit.
 * The consent states.
 * The guard that matters most.
 * The one test that spans both halves of the split...
 * An unsigned journey, with the document if there is one.
```

Start the comment at the first sentence that carries information.

## G. Framework explanation for a standard idiom

```php
 * #[TypeScript] because the transformer cannot name a nested type that is not attributed...
```

```tsx
 * Faithful passthrough of Base UI's accordion, matching collapsible.tsx and checkbox.tsx.
```

A developer working in this codebase knows what the attribute is for. Explain the idiom only where this repo uses it against type.

## H. Over-qualified consequence chains

The block keeps going after the point has landed.

Before and after:

```text
 * Caching what the upstream API actually sent means every read casts exactly once.
 * Present by construction. getAnsweredContent() throws otherwise.
=>
 * Caching what the upstream API sent means every read casts exactly once.
```

```text
...a value the DTO cannot be built from: a scalar where an object belongs, a section
missing a field, schema drift, a proxy rewriting the body. All are caught here so...
=> ...a value the DTO cannot be built from. All are caught here so...
```

The enumeration went; the count and the consequence stayed.

## I. The extraction inventory

Appears only after a class is split, and appears in every piece at once. The shape:

> **[sentence restating the class name]. Knows [X]; knows nothing about [Y]. [OtherClass] owns those.**

```php
/**
 * Reads, validates, and caches the upstream account history envelope. Knows the
 * two root fields the read document asks for and the cache; knows nothing about
 * DTOs, the four-state read contract, or writes. UpstreamHistoryService
 * owns those.
 */
```

Three extracted classes plus the original produced four descriptions of one three-way split, from four angles. The constructor signature and the type names already carry all of it, and it rots faster than ordinary prose: a split gets revised, and every one of the four now names a collaborator that moved or no longer exists.

The half worth keeping is the **negative** clause, and only where it constrains a future edit: `No DTO assembly and no writes belong here`, or `A pure function of (submission, question set), which is what keeps its test in tests/Unit`. Those say where not to add code. The positive inventory says what you can already see.

**State a boundary only as a prohibition, and only once, at the class the prohibition binds.**

## Shape of a good cut

- Drop whole paragraphs first, then rewrite what is left. Typical outcome was four paragraphs to two, or five-to-nine lines to one, and the surviving paragraph was usually re-worded, not just shortened.
- A one-line comment may exceed the normal wrap width. Twelve comments in this cleanup collapsed to a single line rather than being reflowed into a block; ten run past 80 columns and the longest is 174 characters.
- Class and component docblocks took the deepest cuts. The eight files whose class-level or component-level docblock was the target lost 45 to 86 percent of their comment lines; inline comments on a specific statement were mostly kept and shortened, with the reasoning migrating *down* to the statement it explains.
- PHPDoc directives were never removed, and one was added. Across all eight commits, no deleted line contained `@param`, `@return`, `@var`, `@throws`, `@lang` or `@SuppressWarnings`. Trim the prose around a docblock; leave its directives alone.
