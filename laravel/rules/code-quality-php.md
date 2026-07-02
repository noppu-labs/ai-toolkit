---
paths:
    - '{app,bootstrap,config,database,routes,tests}/**/*.php'
description:
    Ensure PHP files adhere to strict linting rules and maintain code quality.
---

## Finishing a task

- When done with a task or before committing, run `docker compose exec cli vendor/bin/duster fix --dirty` followed by
  `docker compose exec cli vendor/bin/duster lint` to fix most code style issues and identify code quality/smell issues.
- Any code quality issues reported must be fixed.

## First-class callable syntax

Where possible, use first-class callable syntax — `someMethod(...)` — instead of a closure that only
forwards its arguments. It is more concise and PHPStan tracks parameter/return types through it.

```php
// Bad — closures that only forward a single argument
$rows->sortBy(fn (ClinicRowDto $row): int => $this->createdAtTimestamp($row));
collect(PatientStatus::cases())->map(fn (PatientStatus $s): PatientStatusOptionDto => PatientStatusOptionDto::fromEnum($s));

// Good — first-class callables
$rows->sortBy($this->createdAtTimestamp(...));
collect(PatientStatus::cases())->map(PatientStatusOptionDto::fromEnum(...));
```

- Works for every callable shape: `strlen(...)`, `$this->method(...)`, `self::method(...)`,
  `SomeClass::staticMethod(...)`, `$object->method(...)`.
- Also prefer it over legacy `[$this, 'method']` / `'strlen'` string callables — those are invisible
  to static analysis and rename refactorings.

Keep an explicit closure when:

- **The receiver passes extra arguments you must not forward.** A first-class callable forwards
  *everything* it is given — `Collection::map()` passes `($value, $key)`, so `->map($this->format(...))`
  silently feeds the key into `format()`'s second parameter if it has one. Use a closure
  (`fn ($value) => $this->format($value)`) whenever the target has optional/variadic parameters that
  the extra arguments could land in.
- The call adapts its input: reorders arguments, fixes a captured value, or dereferences first
  (`fn (Clinic $clinic): string => $clinic->genie_clinic_id`).
- The body is more than a single forwarding call.
- The closure's signature narrows types for PHPStan (e.g. the method accepts `mixed` but the
  collection holds a specific DTO and you want the assertion).
- Inside attribute arguments callables are not constant expressions and will not compile — and
  closure-carrying attribute values crash bref's opcache file cache (see tech-stack notes).

## Comments

- **Single-line:** use `//`.
- **Multi-line (non-doc):** use one `/* … */` block — never stacked `//` lines.
- **Method / property docblocks:** use `/** … */` (double asterisk), for single *or* multi-line,
  so the IDE and PHPStan read directives like `@param`, `@return Type<T>`, and `@var`.

```php
// Good: single-line

/*
 * Good: multi-line uses one block comment
 * instead of several stacked // lines.
 */

/** @var Collection<int, Activity> $documentedArray Good: documented and type hinted a var. */
$documentedArray = ActivityRepository::getRecentActivity();

/** @param array<string, string> $data Good: documented and type hinted a method. */
public function sendActivity(array $data): void

/**
 * Good: multi-line docblock on a method/property
 * 
 * @param non-empty-string $id
 * 
 * @return Collection<int, Activity>
 */
public function getRecentActivityByOrganisationId(string $id): Collection
```

```php
// Bad: a multi-line explanation written as stacked single-line comments —
// use a /* … */ block instead.

/*
 * Bad: a method docblock with a single asterisk; the IDE/PHPStan will not read the
 * @return directive below.
 * @return Collection<int, Activity>
 */
public function getRecentActivity(): Collection
```

## Separation of concerns

- Ensure that the code is not violating any of the SOLID principles.
- Avoid mixing concerns by separating business logic, data access, and presentation layers.
- Use dependency injection to decouple components and promote loose coupling.
- Follow the Single Responsibility Principle (SRP) by ensuring each class or module has a single responsibility.
- Apply the Open/Closed Principle (OCP) to make code more extensible and maintainable.

## Nullable & string checks

Prefer Laravel's `blank()` / `filled()` over hand-rolled `=== null`, `=== ''`, `! $x`, or `empty()` when
guarding nullable values and strings. They treat `null`, `''`, and **whitespace-only** strings (`'   '`)
consistently — catching empty/whitespace input that `=== ''` and `!is_null()` silently let through.

```php
// Bad
if ($value === null || $value === '') { ... }
if (is_string($routeParam) && $routeParam !== '') { ... }

// Good
if (blank($value)) { ... }
if (filled($routeParam)) { ... }
```

- `blank()`/`filled()` only treat strings/null/empty-countables as "blank"; numbers and booleans are never
  blank (`blank(0) === false`, `blank(false) === false`). When a value is `mixed` and you need a usable
  string, combine the guards: `if (! is_string($value) || blank($value)) { return; }`.

## Backend component structure

All domain logic, DTOs, enums, and queries live under `app/Services/{Domain}/`. One folder per business
capability (`Auth`, `UserInvite`, `GenieApi`, `Patient`, …). Each service folder owns everything that
capability needs:

```text
app/Services/UserInvite/
  UserInviteService.php              # orchestrator — the public surface of the service
  Dtos/InviteUserDto.php             # spatie/laravel-data DTOs scoped to this service
  Enums/InviteStatus.php             # backed enums scoped to this service
  Repositories/InviteRepository.php  # service-specific Eloquent queries
```

Rules:

- Eloquent models stay outside services in `app/Models/` (Laravel convention).
- Genuinely cross-cutting, domain-agnostic infrastructure (e.g. base classes shared across every domain)
  may live under `app/Support/`; everything domain-specific stays under `app/Services/{Domain}/`.
- A DTO or enum used by exactly one service belongs to that service. If a second service genuinely needs
  it, surface that as a question before promoting it — premature sharing creates cross-service coupling.
- `*Service.php` classes are orchestrators. They coordinate repositories, DTOs, mailers, jobs, events,
  and other services. They are the only callable surface a controller should know about.
- `*Repository.php` classes hold queries for that domain. They return models or DTOs — never leak raw
  query builders to callers outside the service. Keep queries here, not in DTOs, rules, or traits.
- `Concerns/` holds reusable traits/mixins scoped to a domain (e.g. `Auth/Concerns/ResolvesTargetOrganisation`),
  for logic shared across that domain's classes. See `validation-dtos.md` for DTO validation conventions.

## Thin controllers

Controllers receive a DTO (preferred) or a form request, call **one** service method, and return a
response. Anything more is a smell.

Bad:

```php
public function store(Request $request)
{
    $data = $request->validate([...]);
    $user = User::create($data);
    Mail::to($user)->send(new WelcomeMail($user));
    activity()->log('user.created');
    return redirect()->route('users.index');
}
```

Good:

```php
public function store(CreateUserDto $dto, UserService $users): RedirectResponse
{
    $users->create($dto);

    return redirect()->route('users.index');
}
```

Acceptable controller work:

- Accepting a DTO / form request and forwarding it to a service.
- Choosing between two service calls based on a route parameter or auth state.
- Pulling a single field off a DTO to pass as an argument (minimal extraction only).
- Returning the response: `Inertia::render(...)`, `redirect()`, `response()->json(...)`.

Does **not** belong in a controller:

- Eloquent queries (`User::where(...)`, `->with(...)`, joins, aggregates).
- Business rules or validation beyond what the DTO / form request already handles.
- Direct calls to mailers, queues, events, external APIs, or the filesystem.
- Transaction management (`DB::transaction(...)`).
- Orchestrating more than one service in a single action.

If a controller method grows past ~10 lines, or calls more than one service, the orchestration belongs
in a new service method — move it.

## Models

- Prefer PHP attributes for configurations.

    ```php
    #[Fillable([
        'name',
        'email',
        'cognito_sub',
        'is_active',
        'last_login_at',
    ])]
    #[Hidden([
        'cognito_sub',
    ])]
    #[UseEloquentBuilder(UserBuilder::class)]
    #[UseFactory(UserFactory::class)]
    class User extends Authenticatable {}
    ```

- All models should use dedicated query builders. Opt for adding methods to the builder rather than adding scopes where
  possible.

    ```php
    // Bad:
    class User extends Authenticatable {
        protected function scopeActive(Builder $query): Builder {
            return $query->where('is_active', true);
        }
    }
  
    // Good:
    class UserBuilder extends EloquentBuilder {
        public function active(): self {
            return $this->where('is_active', true);
        }
    }
  
    #[UseEloquentBuilder(UserBuilder::class)]
    class User extends Authenticatable {}
    ```
