---
paths:
    - 'app/**/Dtos/*.php'
    - 'app/**/Rules/*.php'
    - 'app/**/Concerns/*.php'
    - 'app/Support/**/*.php'
description:
    How to validate spatie/laravel-data DTOs and write custom validation attributes.
---

## Validate DTOs with attributes, not `rules()`

Validation lives on the DTO as **property attributes**, not in a `static rules()` method. Attributes are
declarative, colocated with the property, and merge with the rules laravel-data infers from the type.

```php
#[TypeScript]
class InviteUserDto extends Data
{
    public function __construct(
        #[Email]
        #[NotOrganisationMember]
        #[NoPendingOrganisationInvitation]
        public readonly string $email,
        // `name` (non-nullable string) is inferred `required` automatically — no rule needed.
        public readonly string $name,
        #[WithCast(EnumCast::class)]
        #[AssignableOrganisationRole]
        public readonly UserRole $role,
    ) {}
}
```

- Don't re-declare what laravel-data already infers (`required`, enum validity, etc.). Only add what's missing.
- A `rules()` method is a last resort. If you truly need it, it **merges** with inferred + attribute rules
  (per-field override) — but reach for an attribute first.

### Runtime values in attributes (route params, current user)

Attribute arguments must be compile-time constants, so you can't pass a request-time id. Use spatie's
**reference** objects (`new ...` is allowed in attributes; closures are NOT — see below):

```php
// "email unique among users, ignoring the route-bound {user}"
#[Unique(
    table: User::class,
    column: 'email',
    ignore: new RouteParameterReference('user', 'id', nullable: true),
)]
```

References available: `RouteParameterReference`, `AuthenticatedUserReference`, `ContainerReference`,
`FieldReference`. For DB constraints prefer `#[Unique(where: new WhereConstraint(...))]` (see
`CreateOrganisationDto`) — **never a closure** in an attribute argument: closures in attribute args crash
PHP 8.5 / bref's opcache file cache (exit 139). Use `WhereConstraint` / reference objects or a custom rule.

## Custom validation attributes

When a check needs logic or queries the built-ins can't express, write a custom attribute. Extend
`App\Support\Rules\DataValidationRule` — it is both a laravel-data `CustomValidationAttribute` and a Laravel
`ValidationRule`, so you only declare `#[Attribute]` and implement `validate()`:

```php
#[Attribute(Attribute::TARGET_PROPERTY)]
class NoPendingOrganisationInvitation extends DataValidationRule
{
    use ResolvesTargetOrganisation; // domain Concern, resolves the target org

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $organisationId = $this->resolveTargetOrganisationId();

        if (blank($organisationId) || blank($value)) {
            return; // can't scope / nothing to check — let other rules handle emptiness
        }

        // ...query, then $fail('message') when invalid.
    }
}
```

- **Never return `$this` from `getRules()`** — the base returns `clone $this`. laravel-data caches the
  attribute instance on the data class (long-lived under Octane), so a fresh clone keeps any per-validation
  state (`DataAwareRule`/`ValidatorAwareRule`) off the cached instance. Always extend the base; don't
  hand-roll `getRules()`.
- Resolve runtime context (route params, `OrganisationContext`, repositories) **inside** `validate()` via
  `resolve(...)` — attributes are instantiated by reflection and can't constructor-inject.
- Keep queries in repositories, not in the rule/trait. Resolve the repo: `resolve(SomeRepository::class)`.
- A failed rule surfaces as a field error (`errors.<field>`), which Inertia forms render inline — so DTO
  validation is the right home for "this field value isn't allowed" checks.
- Add `@SuppressWarnings("PHPMD.UnusedFormalParameter")` for the unused `$attribute` parameter.

### Where rules and shared bits live

- **Domain-specific rules** → `app/Services/{Domain}/Rules/` (e.g. `Auth/Rules/NotOrganisationMember`).
- **Generic validation infra** (the base class) → `app/Support/Rules/`.
- **Reusable domain logic used beyond validation** (e.g. resolving the target organisation) → that domain's
  `Concerns/` as a trait (e.g. `app/Services/Auth/Concerns/ResolvesTargetOrganisation`), so it's available
  to rules and anything else in the domain.

## DTO validation vs the service layer

- **Field-level eligibility** (email/role allowed, uniqueness, collisions) → DTO attributes. Surfaces inline
  field errors and keeps the service thin.
- **Cross-field / business invariants** that aren't about one field → return a failed result object from the
  service (e.g. `CreateInvitationResult::fail(...)` for clinic-ownership), surfaced as a flash error.
