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

## PHP-6: first-class callables over forwarding closures

A closure whose body is one call that passes the closure's parameters on unchanged and in order is a finding, and so is a string callable (`'strlen'`) or an array callable (`[$this, 'format']`). Propose the first-class callable: `$this->format(...)`, `self::format(...)`, `Formatter::format(...)`, `strlen(...)`.

The rule applies only when the project's minimum PHP version is 8.1 or higher, because first-class callable syntax arrived in 8.1. Read the nearest `composer.json` above the changed file: `config.platform.php` when it is set, otherwise the lowest version `require.php` allows (`^8.0 || ^8.1` allows 8.0, `>=8.2` allows 8.2). With no `composer.json`, or a constraint you cannot resolve, the rule does not fire, and the report's skipped paths say why.

Keep the closure, and report nothing, when:

- The receiver passes arguments the closure drops, and the target would take them. `Collection::map()` calls its callback with `($value, $key)`, so `->map($this->format(...))` feeds the key into `format(Row $row, int $pad = 0)`, and `->map(strtoupper(...))` throws `ArgumentCountError`, because a built-in function rejects arguments past its last parameter. A user-defined target with no optional or variadic parameter ignores the extras and stays a finding.
- The closure adapts its input: it reorders arguments, binds a captured value (`fn (Row $row) => $this->format($row, $width)`), or reads a property first (`fn (User $user) => $user->email`).
- The body does more than one forwarding call.
- The closure's typed parameter narrows what static analysis knows, because the target accepts `mixed` or a wider type.
- The callable is an attribute argument, where a first-class callable is not a constant expression and does not compile.

Say which gain applies. A string or array callable, or a closure with untyped parameters, hides the target's signature from PHPStan and from rename refactoring, and the first-class callable restores it. A closure whose parameters are already typed loses nothing to static analysis; the finding is then only that the shorter form says the same thing.
