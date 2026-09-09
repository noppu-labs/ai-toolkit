# What Survives

The positive standard, taken from comments left untouched in files that were otherwise cut by half. Each explains something no name and no type could carry.

## 1. Contracts with an external system, deploy skew, ordering

```php
 * Reads through mutate() rather than query() for the same reason
 * UpstreamConsentService::find() does: mutate() is the only client method that
 * surfaces the GraphQL `errors` array, and a partial error,
 * `{"data": {"consentContent": null}, "errors": [...]}`, would otherwise be
 * indistinguishable from "no seeded content" and get cached as such.
```

```php
/*
 * The reverse deploy ordering: the upstream API still sending the retired
 * variant hint must not stop a section hydrating, or an account holder could
 * not consent for the length of the rollout.
 */
```

Nobody can derive these from the file. They live in another repo, or in a window between two deploys.

## 2. Gotchas that make correct code look wrong

The strongest category. Without the comment, the next reader "fixes" it.

```php
/*
 * rescue() rather than a typed catch: a wrongly-typed scalar reaches the DTO's
 * promoted string parameter and surfaces as a TypeError, not as a spatie
 * CannotCreateData. report: false because contentFor() reports the
 * UpstreamConsentException thrown below.
 */
```

```php
/*
 * get_debug_type() rather than toBeInstanceOf(): the docblock types make
 * PHPStan treat the instance assertion as redundant, and it is exactly the
 * runtime value the docblock promises that is under test here.
 */
```

```tsx
/*
 * Structural assertions read the container synchronously, so every test waits
 * on the mount first. React has not committed when render() resolves.
 */
```

```tsx
/*
 * The collapsed panel leaves the DOM rather than being hidden in place
 * (keepMounted is false by default), so the assertion is absence, not
 * invisibility.
 */
```

## 3. Domain, legal, and product reasons

```php
 * Only a trailing "test" is stripped: it is the word the hero copy supplies
 * itself... A trailing "beta" is kept, because "public beta test" is ordinary
 * English, where "smoke test test" is not.
```

```tsx
  // ConsentStatus.Unknown: the only case left, and never phrased as unsigned.
```

```tsx
/* ...a clause inside the fail-closed guard in Consent.tsx: */
 * Signing what was never displayed is not informed consent, and [].every() is
 * vacuously true, so an empty acknowledgement list would leave "I consent"
 * enabled with nothing to tick.
```

No amount of renaming reaches a judgement about English, or about what consent means.

## 4. Tripwires

Comments whose job is to make a future edit fail. Write the instruction first, the reasoning second.

```tsx
 * rehype-raw must never be added here.
```

```php
/**
 * Not final: the ConsentController tests container-mock this class, and
 * Mockery cannot mock a final class, matching every other upstream service.
 */
```

```php
 * ...reading one makes find() 404 for the cache TTL. Keep it.
```

## 5. Non-idempotence and cache-ordering invariants

```php
 * The raw wire payload is cached rather than $dto->toArray(), because
 * DisplayProductNameCast is not idempotent: it strips one trailing "test", so
 * a cached toArray() re-hydrated through the cast would turn "foo test test"
 * into "Foo Test" and then into "Foo" on the next read.
```

## 6. Why code is absent, when something non-local proves it

```php
/*
 * DateOfBirthMismatch and PersonalDetailsIncomplete have no arm here: both
 * always return above before this match runs, and PHPStan proves that. An
 * arm for either is unreachable dead code, not a safety net.
 */
```

```tsx
 * href is passed through rather than validated here: react-markdown's default
 * urlTransform has already neutralised anything that is not http, https,
 * mailto, or a fragment.
```

Contrast with pattern E in `deletion-patterns.md`: "no empty-result guard is needed" was cut because the regex on the same screen proves it. These survive because the proof is a static analyser or a library's default.

## 7. Why apparent duplication is not duplication

```ts
      /*
       * Enforced here as well as on the button's disabled attribute: a submit
       * event can reach this handler without the button being pressed
       * (requestSubmit, another submit-capable control), and the disabled
       * attribute alone would leave a path to consenting with nothing ticked.
       */
```

Defence in depth reads as redundancy to anyone who has not thought about the second path.

## 8. Relocate before you delete

A third of the reasoning in this cleanup did not get shortened, it *moved*, to the place that proves it. Both directions appear in the evidence.

Rationale cut from the code and kept on the test that fails if it regresses:

```php
/*
 * toJourneyContext() resolves current() itself, so show() reading the id off
 * the returned context is the whole journey resolution for the page. Asserted
 * against the resolver rather than the upstream lookup because
 * MemoizingAccountLookup is scoped: a duplicate current() would hit the
 * memo and be invisible at the lookup, while still re-scanning the collection.
 */
```

A cross-repo contract note cut from the service's GraphQL constant and kept in the test that asserts it:

```php
    /*
     * No locale variable: nothing in this project passes one and the upstream
     * API falls back to `en` when it is omitted.
     */
```

If a comment explains behaviour, ask which file would fail when that behaviour changes. That is where it belongs. An agent working only from `deletion-patterns.md` will delete these; the rule is to relocate first.

## 9. Source, or commit message?

Transition reasoning belongs in the commit message: why this changed, what it used to be, what was measured to justify it. Standing reasoning belongs in the source. The reason is durability: **a commit message cannot rot.** It describes a moment, and the moment does not change. A commit explaining a three-way class split stays accurate even after the split is half-reversed an hour later, because it says what happened then rather than what is true now. A source comment that describes a transition decays, and decays silently, because nothing tests it.

The test for which is which is not "is it already in the commit message", which over-cuts badly. It is **would the reader know to look**:

- Someone who *knows* something changed can `git log -S` for it, because seeing it disappear gave them the search term. That goes in the commit message.
- Someone who *stumbles* into an oddity has no search term, and no reason to suspect history holds an answer. That goes in the source.

Two identical methods in two files is a stumble: the reader asks "why is this not DRY?" and nothing tells them to check history. A `v2` suffix on a cache key that looks like leftover noise is a stumble, and deleting it logs every user out for a full TTL. `Not final:` is a stumble. All three stay in the source however well the commit message covers them.

One operational caveat. When a branch is squash-merged, its commit messages collapse into a single body on the target branch, and that body is routinely trimmed at merge time. If reasoning is essential and the merge is a squash, either preserve the bodies deliberately or put the one or two critical sentences in the source, on purpose, not by discovering it later.

## Comments in tests

Tests were trimmed least. No test file lost more than a third of its comment lines, a 4 to 34 percent reduction, while five production files lost half or more, up to 86 percent. One controller test file kept 124 comment lines after cleanup.

A test comment survives when it answers **what regression does this catch**, or **why is this the expected behaviour**:

```php
/*
 * The whole point of the degraded path: an upstream outage resolves the
 * deferred prop as ConsentStatus::Unknown rather than failing the partial
 * reload, and never as "unsigned", and still reaches the error tracker on the
 * way through.
 */
```

```php
/*
 * An absent document is a null prop, not a missing one: the page branches on
 * it to withhold the signature form, and "missing" would be indistinguishable
 * from "still in flight".
 */
```

Single-line `//` carrying the policy behind an assertion is the dominant form:

```php
    // A mistyped date of birth is expected user behaviour, not an upstream fault.
    // A rejected signature on a legal record must not be invisible in the error tracker.
    // The real service, not the partial mock the beforeEach installs.
```

Test comments that restated the test name were cut like any other framing sentence.

Fixture data that looks wrong needs a comment saying why it is deliberate:

```php
/*
 * DisplayProductNameCast strips one trailing "test", so it is not idempotent:
 * caching $dto->toArray() instead of the raw wire payload would read "Foo Test"
 * on the first lookup and "Foo" on the second. The name is contrived on
 * purpose, because a realistic one would round-trip and hide the regression.
 */
```

## Applies to TypeScript and React too

The same standard applied to components, hooks, and Vitest tests as to PHP classes and Pest tests, so treat everything here as language independent. JSX comments follow the same rules inside `{/* ... */}`.
