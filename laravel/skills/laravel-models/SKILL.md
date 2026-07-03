---
name: laravel-models
description: Eloquent model patterns and database layer. Use when creating or modifying models, relationships, casts, or observers.
---

# Laravel Models

Models represent database tables and domain entities.

**Related guides:**
- [Query Builders](../laravel-query-builders/SKILL.md) - Custom query builders (not scopes)
- [DTOs](../laravel-dtos/SKILL.md) - Casting model JSON columns to DTOs

## Philosophy

Models should:
- Use **custom query builders** (not local scopes) - see [Query Builders](../laravel-query-builders/SKILL.md)
- Define relationships
- Define casts
- Contain simple accessors/mutators
- **NOT contain business logic** (that belongs in Actions)
- **Prefer PHP attributes** over properties/methods where available (Laravel 12+ for `#[UseEloquentBuilder]`, Laravel 13+ for `#[Table]`, `#[ObservedBy]`, `#[UsePolicy]`, `#[UseFactory]`, etc.)

## Basic Model Structure

```php
<?php

declare(strict_types=1);

namespace App\Models;

use App\Builders\OrderBuilder;
use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Attributes\UseEloquentBuilder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[UseEloquentBuilder(OrderBuilder::class)]
class Order extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'total' => 'integer',
        ];
    }

    // Relationships
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }
}
```

## Casts

**Define casts for type safety:**

```php
protected function casts(): array
{
    return [
        'status' => OrderStatus::class,         // Enum
        'total' => 'integer',                   // Integer
        'is_paid' => 'boolean',                 // Boolean
        'metadata' => OrderMetadataData::class, // DTO
        'completed_at' => 'datetime',           // Carbon
        'tags' => 'array',                      // JSON array
    ];
}
```


## Model Methods

**Simple helper methods** are acceptable:

```php
class Order extends Model
{
    public function isPending(): bool
    {
        return $this->status === OrderStatus::Pending;
    }

    public function isCompleted(): bool
    {
        return $this->status === OrderStatus::Completed;
    }

    public function canBeCancelled(): bool
    {
        return $this->isPending() || $this->status === OrderStatus::Processing;
    }
}
```

**But NOT business logic:**

```php
// ❌ Bad - business logic in model
class Order extends Model
{
    public function cancel(): void
    {
        DB::transaction(function () {
            $this->update(['status' => OrderStatus::Cancelled]);
            $this->refundPayment();
            $this->notifyCustomer();
        });
    }
}

// ✅ Good - business logic in action
class CancelOrderAction
{
    public function __invoke(Order $order): Order
    {
        return DB::transaction(function () use ($order) {
            $order->update(['status' => OrderStatus::Cancelled]);
            resolve(RefundPaymentAction::class)($order);
            resolve(NotifyCustomerAction::class)($order);
            return $order;
        });
    }
}
```

## Model Observers

**For model lifecycle hooks:**

```php
<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Order;
use Illuminate\Support\Str;

class OrderObserver
{
    public function creating(Order $order): void
    {
        if (! $order->uuid) {
            $order->uuid = Str::uuid();
        }
    }

    public function created(Order $order): void
    {
        // Dispatch event, queue job, etc.
    }

    public function updating(Order $order): void
    {
        // Before update
    }

    public function updated(Order $order): void
    {
        // After update
    }

    public function deleted(Order $order): void
    {
        // After delete
    }
}
```

**Register in AppServiceProvider:**

```php
use App\Models\Order;
use App\Observers\OrderObserver;

public function boot(): void
{
    Order::observe(OrderObserver::class);
}
```

## Model Concerns (Traits)

**Extract reusable behavior:**

**[View full implementation →](references/HasUuid.php)**

**Use in models:**

```php
class Order extends Model
{
    use HasUuid;
}
```

## Route Model Binding

### Implicit Binding

```php
// Route
Route::get('/orders/{order}', [OrderController::class, 'show']);

// Controller - automatically receives Order model
public function show(Order $order) { }
```

### Custom Key

```php
Route::get('/orders/{order:uuid}', [OrderController::class, 'show']);
```

### Custom Resolution

```php
public function resolveRouteBinding($value, $field = null)
{
    return $this->where($field ?? 'id', $value)
        ->where('is_active', true)
        ->firstOrFail();
}
```

## Mass Assignment Protection

**Every model defines an explicit `$fillable` allowlist.** Never call `Model::unguard()` and never use `$guarded = []` — both allow attackers to set fields like `is_admin`, `role`, or `user_id` by adding extra request parameters. See [sec-injection-prevention](../laravel-owasp-security/rules/sec-injection-prevention.md).

### Model Configuration

Prefer the `#[Fillable]` attribute; the `$fillable` property works the same way:

```php
// ✅ Good - explicit allowlist via attribute
#[Fillable([
    'status',
    'total',
    'notes',
])]
class Order extends Model
{
    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
        ];
    }
}

// ✅ Also good - explicit allowlist via property
class Order extends Model
{
    protected $fillable = [
        'status',
        'total',
        'notes',
    ];
}

// ❌ Bad - everything becomes mass assignable
class Order extends Model
{
    protected $guarded = [];
}

// ❌ Bad - Model::unguard() in a service provider disables protection globally
```

### What Belongs in $fillable

Only fields the user may submit. Ownership and system-controlled fields (`user_id`, `is_admin`, `published_at`) stay **out** of `$fillable` and are set explicitly:

```php
Order::create([
    ...$request->validated(),
    'user_id' => auth()->id(), // set explicitly, never mass-assigned
]);
```

### Why Explicit $fillable?

- **Security**: The allowlist is the last line of defense when validation misses a field
- **Auditability**: The model documents exactly which fields accept user input
- **Defense in depth**: Pair with `$request->validated()` — never pass `$request->all()` to `create()`/`fill()`/`update()`

Factories and seeders are unaffected — Laravel factories bypass mass assignment protection internally.

## Model Organization

```
app/Models/
├── Order.php
├── User.php
├── Concerns/
│   ├── HasUuid.php
│   ├── BelongsToTenant.php
│   └── Searchable.php
└── Contracts/
    └── Searchable.php
```

## Testing Models

```php
it('only mass assigns fillable attributes', function () {
    $order = Order::factory()->create();

    $order->fill([
        'total' => 1000,
        'user_id' => 999, // not in $fillable — must be ignored
    ]);

    expect($order->total)->toBe(1000)
        ->and($order->user_id)->not->toBe(999);
});

it('casts status to enum', function () {
    $order = Order::factory()->create(['status' => 'pending']);

    expect($order->status)->toBeInstanceOf(OrderStatus::class);
});

it('has user relationship', function () {
    $order = Order::factory()->create();

    expect($order->user)->toBeInstanceOf(User::class);
});
```

