# PHP rules

## PHP-1: no `mixed` where a narrower type is reachable

`mixed` is a finding when the value's origin has a known type, or when a union of two or three concrete types describes it. Cite the narrowing that was possible. `mixed` is not a finding at a boundary that accepts arbitrary input and narrows on the next line.

## PHP-2: structured data crosses boundaries as DTOs, not arrays

A method that returns or accepts an associative array with a fixed key set, and whose caller reads named keys from it, is a finding. Propose the DTO shape. Arrays of primitives, lists, and maps with dynamic keys are not findings.

## PHP-3: array-shape pseudo-types need a stated reason

`array{...}` and `@phpstan-type` shapes are acceptable when data is received and mutated before a DTO is assembled, and the reason is visible where the shape is declared. Without a reason, the finding proposes one of:

- A DTO, when the shape is consumed as is.
- A builder with `set()` calls and a `build()` that returns the DTO, when the payload is medium or large and assembled over several steps.

For an array of three primitives a builder is overkill; propose the DTO or accept the shape with a one-line reason.

## PHP-4: no duplicate types

Two types with the same field set, or a type that is another type plus one field, are a finding. Propose the hierarchy: a base type and a subtype, or a shared DTO. Judge by shape, not by name.

## PHP-5: sanity checks

- `declare(strict_types=1)` at the top of every file.
- A return type on every method, including `void` and `never`.
- Generics on every collection type (`Collection<int, Item>`, `array<string, int>`).
