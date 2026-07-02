---
paths:
    - 'app/Providers/**/*.php'
---

## Resolve external clients through the container

External SDK clients (AWS, HTTP, third-party libraries) **must** be resolved through
`$this->app->make(...)` instead of being constructed inline with `new`. A unit test can mock
`Application::make` and return a Mockery mock; it cannot intercept a `new` call.

```php
// Bad — impossible to mock in a unit test
private function getClient(string $region): SecretsManagerClient
{
    return new SecretsManagerClient([
        'version' => 'latest',
        'region'  => $region,
    ]);
}

// Good — the test can mock Application::make to return a Mockery client
private function getClient(string $region): SecretsManagerClient
{
    return $this->app->make(SecretsManagerClient::class, [
        'args' => [
            'version' => 'latest',
            'region'  => $region,
        ],
    ]);
}
```

## Use contextual bindings for constructor injection

When only one consumer needs a specific configuration of a dependency, register a contextual binding
instead of a global singleton. Pass a first-class callable (`$this->resolveX(...)`) to `give()` so the
factory only runs when the dependency is actually needed.

```php
#[Override]
public function register(): void
{
    $this->app->when(CognitoOtpService::class)
        ->needs(CognitoIdentityProviderClient::class)
        ->give($this->resolveCognitoClient(...));
}

private function resolveCognitoClient(Application $app): CognitoIdentityProviderClient
{
    return new CognitoIdentityProviderClient([
        'region'  => $app->get(ConfigRepository::class)->string('services.cognito.region'),
        'version' => 'latest',
    ]);
}
```

## Read config through `ConfigRepository`, not the `config()` facade

Inside providers, resolve `Illuminate\Config\Repository` from the container. The `config()` facade may
not be wired up at the moment `register()` runs, and explicit container access keeps providers easy to
unit-test against a mocked `Application`.

```php
// Bad — relies on facade resolution
$arn = config('services.rds.secret_arn');

// Good
$config = $this->app->get(ConfigRepository::class);
$arn = $config->string('services.rds.secret_arn');
```

Use the typed accessors (`string()`, `integer()`, `boolean()`, `array()`) — they fail loudly when the
value is missing or the wrong type, which the env-gated pattern below relies on.

## Gate fail-fast behavior on the environment

Bootstrap work that needs real infrastructure (AWS Secrets Manager, KMS keys, etc.) should hard-fail in
production-like environments but degrade gracefully locally. Express this with
`$this->app->environment(...)` and `throw_if`.

```php
private function shouldThrowWhenMissingCredentials(): bool
{
    return $this->app->environment('production', 'uat', 'sandbox');
}

private function hydratePostgresCredentials(ConfigRepository $config): void
{
    try {
        $secretArn = $config->string('services.rds.secret_arn');
        $region    = $config->string('services.rds.region');
    } catch (Exception $exception) {
        throw_if($this->shouldThrowWhenMissingCredentials(), $exception);

        return;
    }

    // ... rest of the hydration
}
```

## Testing

Every provider needs a unit test under `tests/Unit/Providers/`. The provider's constructor takes
`Illuminate\Contracts\Foundation\Application`, so a unit test mocks that interface — no framework
boot, no `Tests\TestCase`. See [`.claude/rules/testing-pest.md`](./testing-pest.md) for the full
unit-test conventions.
