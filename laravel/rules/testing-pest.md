---
paths:
    - 'tests/**/*'
---

## Test files mirror the source tree

A test file's path under its suite root **must** mirror the path of the class it tests under `app/`.
Take the class's namespace below `App\`, prepend the suite root (`tests/Feature/` or `tests/Unit/`), and
append `Test` to the filename. There is exactly **one** test file per source class.

| Source file | Test file |
| --- | --- |
| `app/Http/Controllers/PatientController.php` | `tests/Feature/Http/Controllers/PatientControllerTest.php` |
| `app/Services/Auth/AuthService.php` | `tests/Feature/Services/Auth/AuthServiceTest.php` |
| `app/Services/Patient/Dtos/PatientDto.php` | `tests/Unit/Services/Patient/Dtos/PatientDtoTest.php` |
| `app/Policies/UserPolicy.php` | `tests/Feature/Policies/UserPolicyTest.php` |

- The suite root (`Feature` vs `Unit`) is chosen by the **Quick decision** below; the path **after** the
  suite root always matches the source namespace exactly. Do not invent intermediate folders (e.g.
  `tests/Feature/Controllers/...` when the class lives in `App\Http\Controllers`).
- If you find a class's tests spread across multiple files, or a file in a path that no longer mirrors
  its source, consolidate into the single correct path and delete the stragglers.

## Unit vs feature tests

`tests/Pest.php` auto-extends `Tests\TestCase` (and applies `RefreshDatabase`) **only for tests under
`tests/Feature/`**. Tests under `tests/Unit/` extend plain `PHPUnit\Framework\TestCase` — they do **not**
boot the Laravel application. Pick the right suite before you write the first line.

### Quick decision

If the class needs the container, the database, the HTTP kernel, queues, events, mail, or any facade to
do its job, the test goes under `tests/Feature/`. Otherwise, it goes under `tests/Unit/` and you
construct the subject yourself with plain values.

### Unit tests (`tests/Unit/**`)

A unit test exercises a single class in isolation, with no framework boot.

- **DO NOT** call `pest()->extend(Tests\TestCase::class)`. If the test needs the framework, it belongs
  in `tests/Feature/`.
- **DO NOT** touch the container or facades. No `app()`, `resolve()`, `instance()`,
  `Pest\Laravel\instance`, `Pest\Laravel\mock`, `config()`, `Exceptions::fake()`, `Mail::fake()`, etc.
- **DO NOT** seed `config([...])` in `beforeEach` — pass explicit values to the constructor instead.
- **DO NOT** use `RefreshDatabase`, model factories, Eloquent, or HTTP helpers (`get`, `post`, `actingAs`).
- **DO** construct the subject with explicit, plain values and mocked collaborators:
    ```php
    // Good — pure unit test of CognitoOtpService
    $client = Mockery::mock(CognitoIdentityProviderClient::class);
    $service = new CognitoOtpService(
        userPoolId: 'us-east-1_TestPool',
        userPoolClientId: 'client-id',
        userPoolClientSecret: 'shhh',
        client: $client,
    );
    ```
- **DO** mock external dependencies with plain `Mockery::mock(...)`. The container-aware
  `Pest\Laravel\mock` / `Pest\Laravel\instance` helpers require the framework boot and are forbidden in
  unit tests.
- **DO** reach private methods through BetterReflection (`ReflectionMethod::createFromInstance(...)`)
  rather than only via public surface area. See the **Reflection** section below.
- **DO** keep container-resolution / binding tests in the corresponding **service provider test**, not
  in the service test:
    ```php
    // Bad — couples a unit test to the container binding
    it('resolves CognitoIdentityProviderClient from the container', function (): void {
        $service = resolve(CognitoOtpService::class);
        // ...
    });

    // Good — that case belongs in AwsCognitoProviderTest, not CognitoOtpServiceTest.
    ```
- When the class under test takes `Illuminate\Contracts\Foundation\Application` (e.g. a service
  provider), mock the interface and stub the exact container calls you expect:
    ```php
    /** @var Application&MockInterface $app */
    $app = Mockery::mock(Application::class);
    $app->shouldReceive('make')
        ->once()
        ->with(SecretsManagerClient::class, ['args' => ['version' => 'latest', 'region' => 'ap-southeast-2']])
        ->andReturn($mockClient);

    $provider = new AwsSecretsHydrationServiceProvider($app);
    ```

### Feature tests (`tests/Feature/**`)

A feature test boots the framework and exercises the application end-to-end (HTTP, DB, queues, events,
mail).

- **DO** rely on the auto-applied `Tests\TestCase` + `RefreshDatabase` from `tests/Pest.php`. Do not
  re-apply them.
- **DO** use the container and facades: `app()`, `resolve()`, `config()`, `Pest\Laravel\instance`,
  `Pest\Laravel\mock`, `Exceptions::fake()`, `Mail::fake()`, `Queue::fake()`, etc.
- **DO** test HTTP routes, redirects, Inertia responses, DB persistence, and side-effects.
- **DO NOT** mock the class under test — mock its collaborators (external services, mailers, queues).
- **DO NOT** add `pest()->extend(...)` or `use Tests\TestCase` — they're already applied.

## Testing style

- Use `it(...)` instead of `test(...)`.
- Use `describe()` blocks for each method tested. All `it()` cases for that unit live inside.. Example:
    ```php
    describe('getBaseQuery', function (): void {
        it('returns a query builder instance', function (): void {
            $repo = new UrlRedirectRepository();
    
            $query = $repo->getBaseQuery();
    
            expect($query)->toBeInstanceOf(Builder::class)
                ->and($query->getModel())->toBeInstanceOf(UrlRedirect::class);
        });
    });
    ```
- You DO NOT need to create a `describe()` for the class name under test.
- In feature tests, you DO NOT need to create a `describe()` for cases that don't belong to a specific feature
 (such as GET / POST / DELETE calls).
- Phrase `it()` labels as descriptive sentences without the `should` prefix (e.g. `it("renders the label")`,
  `it("is called with the row when a row is clicked")`).
- DO NOT use `$this` calls in tests. You have Pest tools available such as `Pest\Laravel\mock`
  and `Pest\Laravel\instance` to mock instances and interact with the container. For example:
    ```php
    use function Pest\Laravel\mock;
    use function Pest\Laravel\instance;
    
    // This will mock the service and make it available in the container.
    mock(ExampleService::class);
    // This will get the service we mocked above from the container.
    $mockedService = resolve(ExampleService::class);
    
    // This will instantiate a concrete object and make it available in the container.
    $concreteObject = new UserRepository()
    instance(UserRepository::class, new UserRepository());
    // This will get the concrete object we instantiated from the container.
    $fetchedConcreteObject = resolve(UserRepository::class);
    ``` 
- Add a docblock to mocked variables so the IDE can understand it its type as `ObjectType&MockInterface`. For example:
    ```php
    use function Pest\Laravel\mock;
    
    /** @var SomeService&MockInterface $service */
    $service = mock(SomeService::class);
    ```
- Avoid creating helper files for tests. `beforeEach` and `afterEach` are available in Pest for setups.
- Avoid creating setup functions within tests. Model factories are often the solution for this.

## Testing exceptions

- Chain `->throws(ExceptionClass::class)` on the `it()` call when a test's purpose is to
  verify that some code throws. Put the throwing call last in the test body so any preceding
  expectations still run.
    ```php
    it('rejects an invalid input', function (): void {
        $service = resolve(SomeService::class);

        $service->doThing('bad-input');
    })->throws(InvalidArgumentException::class);
    ```
- Use `expect(fn () => ...)->toThrow(ExceptionClass::class)` only when you need to combine the throw
  assertion with other expectations in the same test (e.g. asserting state after the throw, or chaining
  `->and(...)` with unrelated checks).
    ```php
    it('restores state after a failed call', function (): void {
        $originalId = 100;
        $model = Model::factory()->create(['id' => $originalId]);

        expect(fn () => $model->update(['id' => 200]))->toThrow(QueryException::class)
            ->and($model->id)->toBe($originalId);
    });
    ```

## Narrowing nullable values

- Prefer `expect($value)->not->toBeNull()` combined with the nullsafe operator (`?->`) over
  `assert($value !== null)`. The expectation fails the test cleanly if the value is null and PHPStan
  understands the subsequent nullsafe access.
    ```php
    $refreshed = $user->fresh();
    
    expect($refreshed)->not->toBeNull()
        ->and($refreshed?->is_active)->toBeTrue();
    ```

## Long expressions inside `expect()`

- Extract long Eloquent queries or multi-step expressions into a local variable before passing them to
  `expect()`. This keeps the assertion readable and makes failures easier to diagnose.
    ```php
    // Bad
    expect(OrganisationUser::query()->where('user_id', $user->id)->where('organisation_id', $org->id)->exists())->toBeTrue();

    // Good
    $membershipExists = OrganisationUser::query()
        ->where('user_id', $user->id)
        ->where('organisation_id', $org->id)
        ->exists();

    expect($membershipExists)->toBeTrue();
    ```

## Mocking

- Add a docblock to mocked variables so the IDE can understand its type as `ObjectType&MockInterface`.
    ```php
    use function Pest\Laravel\mock;
    
    /** @var FulgentLabService&MockInterface $service */
    $service = mock(FulgentLabService::class);
    ```
- DO NOT use `$this` calls in tests. You have Pest tools available such as `Pest\Laravel\mock` and `Pest\Laravel\instance`
  to mock instances and interact with the container.
    ```php
    // Bad
    $this->mock(SomeService::class);
    $this->app->get(SomeService::class);
    $this->instance(SomeRepository::class;
    $this->app->get(SomeRepository::class);
  
    // Good
    use function Pest\Laravel\mock;
    use function Pest\Laravel\instance;
    
    // Mock the service and make it available in the container.
    mock(SomeService::class);
    // Get the service we mocked above from the container.
    $mockedService = resolve(SomeService::class);
    
    // Instantiate a concrete object and make it available in the container.
    $concreteObject = new SomeRepository()
    instance(SomeRepository::class, new SomeRepository());
    // Get the concrete object we instantiated from the container.
    $fetchedConcreteObject = resolve(SomeRepository::class);
    ```
- Use `Pest\Laravel\mock` for container-aware mocks, such as when you are testing a service that requires dependency
  injection, and you need to perform assertions on its dependencies. Otherwise, use `Mockery::mock()` for simple mocks.
    ```php
    // Container-aware mock - useful for testing services that require dependency injection.
    use Pest\Laravel\mock;
  
    it('deletes organisation data and its related records', function (): void {
        $orgId = 891;
        $repositoryMock = mock(OrganisationRepository::class);
        $repositoryMock->shouldReceive('deleteOrganisationUsers')->once()->with($orgId);
        $repositoryMock->shouldReceive('deleteOrganisationClinics')->once()->with($orgId);
        $repositoryMock->shouldReceive('deleteOrganisation')->once()->with($orgId);
    
        $service = resolve(OrganisationRemovalService::class);
        $result = $service->deleteOrganisation($orgId);
    
        expect($result)->toBeTrue();
    });
  
    // Mockery:mock() - useful for mocking simple objects like a DTO or a Model.
    it('returns true when getValue() is called', function (): void {
        $modelMock = Mockery::mock(SomeModel::class);
        $modelMock->shouldReceive('getValue')->once()->andReturn(true);
    
        expect($modelMock->getValue())->toBeTrue();
    });
    ```

## Reflection

- Always use the BetterReflection (`roave/better-reflection`) package instead of PHP's built-in reflection
  API (`ReflectionClass`, `ReflectionProperty`, `ReflectionMethod` from the global namespace).
- Import reflection classes from `Roave\BetterReflection\Reflection\*` — never reference the global
  `\ReflectionClass` / `\ReflectionProperty` / `\ReflectionMethod`.
- Prefer the `createFromInstance(...)` / `createFromName(...)` factories over `new ReflectionClass(...)`.
- You do not need to call `setAccessible(true)` with BetterReflection — private and protected members
  are accessible by default.

    ```php
    // Bad — uses PHP's built-in reflection API
    $reflection = new ReflectionClass($service);
    $property = $reflection->getProperty('client');
    $property->setAccessible(true);
    $clientValue = $property->getValue($service);

    // Bad — fully qualified built-in reflection
    $property = new \ReflectionProperty($service, 'client');
    $property->setAccessible(true);
    $clientValue = $property->getValue($service);

    // Good — BetterReflection on an existing instance
    use Roave\BetterReflection\Reflection\ReflectionProperty;

    $clientProperty = ReflectionProperty::createFromInstance($service, 'client');
    $clientValue = $clientProperty->getValue($service);
    ```

    ```php
    // Bad — built-in ReflectionClass to read a class without instantiation
    $reflection = new ReflectionClass(SomeService::class);
    $method = $reflection->getMethod('handle');

    // Good — BetterReflection by class name
    use Roave\BetterReflection\Reflection\ReflectionClass;

    $reflection = ReflectionClass::createFromName(SomeService::class);
    $method = $reflection->getMethod('handle');
    ```
