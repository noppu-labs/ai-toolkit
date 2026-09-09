---
name: type-safety-review
description: Review a diff or a path for type-safety findings (mixed and any, unstructured arrays where a DTO belongs, array-shape pseudo-types without a reason, duplicate types, unchecked casts). Use during PR review, before opening a PR, or when asked about type coverage or type hierarchy. Calibrated on PHP and PHPStan first, with a TypeScript section.
---

# Type-safety review

This skill is a checklist, not an editor. It walks the types a diff or a path introduces, rules each one against the rules in `references/php.md` and `references/typescript.md`, and reports every finding with the shape it proposes instead. It edits no file, writes no code, and makes no commit; the reviewer decides what to act on.

## Scope

`/review:type-safety-review [path or base=... head=...]`

One of two things is in scope, never both:

- **A diff**, when `base=` and `head=` are given, with the same defaults as step 0 of [../comment-audit/SKILL.md](../comment-audit/SKILL.md) when either is omitted. Read `git diff BASE...HEAD`, three dots, so only what the branch adds is ruled on.
- **A path**, when a path is given as the argument. Every file under it is in scope whatever its git state, and `base=` and `head=` are ignored.

Generated code is out of scope. Skip any path carrying a generated-code marker: `generated` as a path segment, `wayfinder`, a `.d.ts` file under a generated directory, `_ide_helper`. Skip `vendor/`, `node_modules/`, and lockfiles as well. List what was skipped in the report.

## Method

Before ruling on a candidate, open the definition the type flows from. For a `mixed` parameter that is the callers; for an array crossing a boundary that is the method that builds the array and the call site that reads it; for a cast that is the value's origin. A search hit is not a read.

A narrower type that is not reachable is not a finding. When the origin has no narrower type to offer, there is nothing to propose and the candidate is dropped. Say why it was not reachable whenever a reviewer reading the same line would wonder why it is missing from the report.

When the origin cannot be resolved, say so in the finding and name the file that would settle it. An unresolved origin is not evidence that a finding exists.

## Rules

Read [references/php.md](references/php.md) for PHP and [references/typescript.md](references/typescript.md) for TypeScript. Rule ids are `PHP-1` through `PHP-5` and `TS-1` through `TS-4`. Every finding carries exactly one rule id, and no finding is reported without one.

## Finding format

Each finding is one block in this shape:

```text
**path:line, <rule id>**: "<quote>". Reason. Proposed shape:
```

followed by a fenced block holding the proposed type. Line numbers come from the HEAD side of the diff so they can be pasted as PR review comments. The quote is verbatim from that line, so the reviewer does not need the diff open.

One filled example:

**app/Services/Billing/InvoiceTotalsCalculator.php:31, PHP-2**: "`public function forOrder(Order $order): array`". The method returns `['subtotal' => ..., 'tax' => ..., 'total' => ...]` and its only caller, `InvoiceController::show()`, reads all three by name, so the key set is fixed and already named at the call site. Proposed shape:

```php
final readonly class InvoiceTotals
{
    public function __construct(
        public Money $subtotal,
        public Money $tax,
        public Money $total,
    ) {}
}
```

## Report

The report is the whole output of this skill. It has two parts, in this order:

1. A count per rule id, listing every id from `PHP-1` to `PHP-5` and `TS-1` to `TS-4` including the ones with zero findings, then the paths skipped as generated or vendored.
2. The findings, grouped by file, most severe first both within a file and between files.

Severity order, highest first:

1. An unchecked cast, or `mixed` on a boundary (`PHP-1`, `TS-1`, `TS-3`).
2. An unstructured array crossing a boundary (`PHP-2`).
3. A duplicate type (`PHP-4`, `TS-4`).
4. A pseudo-type without a stated reason, and the loose object it maps to in TypeScript (`PHP-3`, `TS-2`).
5. A missing sanity check (`PHP-5`).

Nothing outside the report is produced. A finding proposes a shape; it never applies one.

## Style

The report follows [../writing-comments/references/style.md](../writing-comments/references/style.md).
