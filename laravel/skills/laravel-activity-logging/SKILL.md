---
name: laravel-activity-logging
description: Use when adding an audit trail, recording who did what, logging login or model events, or tracking changes with spatie/laravel-activitylog v5 — keywords spatie activitylog, activity log, LogsActivity trait, causedBy, performedOn, withProperties, activity_log table, getActivitylogOptions, logOnlyDirty, ActivityEvent, beforeLogging, custom column grouping, organisation scoping.
---

# Laravel Activity Logging

Audit trails with `spatie/laravel-activitylog` v5. Records who did what to which model, with what changed.

**Related guides:**
- [Models](../laravel-models/SKILL.md) - The trait lives on Eloquent models
- [Enums](../laravel-enums/SKILL.md) - `ActivityEvent` is a backed enum
- [Services](../laravel-services/SKILL.md) - Manual logging belongs in actions/services, not controllers

## Overview

There are **two ways to log**:

1. **Automatic model events** — add the `LogsActivity` trait to a model and it logs `created` / `updated` / `deleted` / `restored` for you, recording attribute changes.
2. **Manual logging** — call the `activity()` helper for domain events that aren't a single model write (logins, exports, bulk actions, external side effects).

Both write to the `activity_log` table, queryable via the `Spatie\Activitylog\Models\Activity` model. Setup (config, migration) is already done — this guide is usage only.

## When to Use

**Use automatic model logging when:**
- You want a change history on a model (who edited a `Patient`, what fields changed)
- Compliance/audit requirements on sensitive records

**Use manual logging when:**
- The event isn't a model write (user logged in, report downloaded, webhook received)
- You need a human-readable description with custom properties

## Quick Reference

| Operation | Code |
|-----------|------|
| Log a model automatically | `use LogsActivity;` + `getActivitylogOptions()` |
| Log only changed attributes | `LogOptions::defaults()->logOnly([...])->logOnlyDirty()` |
| Exclude sensitive fields | `->logExcept(['password', 'remember_token'])` |
| Suppress no-op updates | `->dontLogEmptyChanges()` |
| Manual log | `activity()->causedBy($user)->performedOn($subject)->log('...')` |
| Add custom data | `->withProperties(['ip' => $ip])` (many) / `->withProperty('ip', $ip)` (one) |
| Tag the event type | `->event('verified')` |
| Write to a named log | `activity('auth')->log('...')` |
| Read what changed | `$activity->attribute_changes` (`['attributes'=>..., 'old'=>...]`) |
| Query by causer | `Activity::causedBy($user)->get()` |
| Query a subject's history | `Activity::forSubject($patient)->get()` |
| Disable for a block | `activity()->withoutLogging(fn () => ...)` |
| Set causer in a job | `Activity::defaultCauser($admin, fn () => ...)` |
| Prune old records | `php artisan activitylog:clean --force` |

## Automatic model logging (LogsActivity trait)

Add the trait and implement `getActivitylogOptions()`. In v5 the trait lives under `Models\Concerns` (see Common Mistakes).

```php
<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Spatie\Activitylog\Models\Concerns\LogsActivity;
use Spatie\Activitylog\Support\LogOptions;

class Patient extends Model
{
    use LogsActivity;
    use SoftDeletes;

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['first_name', 'last_name', 'email', 'status'])
            ->logExcept(['remember_token'])
            ->logOnlyDirty()          // only record attributes that actually changed
            ->dontLogEmptyChanges()   // skip the activity entirely if nothing changed
            ->useLogName('patient')
            ->setDescriptionForEvent(fn (string $eventName): string => "Patient {$eventName}");
    }
}
```

This logs `created`, `updated`, `deleted`, and — because the model uses `SoftDeletes` — `restored` automatically. Without `SoftDeletes` you get exactly `created` / `updated` / `deleted`. To pin the set explicitly regardless, use `$recordEvents` (below).

**Other attribute selectors** (pick one as the base, then refine):

```php
LogOptions::defaults()->logAll();           // every attribute
LogOptions::defaults()->logFillable();      // all $fillable attributes
LogOptions::defaults()->logUnguarded();     // all attributes not in $guarded
LogOptions::defaults()->logOnly(['name', 'status', 'parent.name']); // dot-notation walks relations
```

**Restrict which events fire** with static props on the model:

```php
protected static array $recordEvents = ['updated', 'deleted'];   // only these
// or
protected static array $doNotRecordEvents = ['created'];          // all except these
```

**Skip an activity when only noise changed:**

```php
LogOptions::defaults()
    ->logOnlyDirty()
    ->dontLogIfAttributesChangedOnly(['last_seen_at', 'updated_at']);
```

**Mutate the activity before it's saved** with the `beforeActivityLogged` hook on the model:

```php
use Spatie\Activitylog\Contracts\Activity;

public function beforeActivityLogged(Activity $activity, string $eventName): void
{
    $activity->properties = $activity->properties->put('ip', request()->ip());
}
```

### Reading what changed

```php
use Spatie\Activitylog\Models\Activity;

$activity = Activity::forSubject($patient)->latest()->first();

$activity->attribute_changes;
// Collection: ['attributes' => ['status' => 'active'], 'old' => ['status' => 'pending']]

$activity->attribute_changes['attributes']; // new values
$activity->attribute_changes['old'];        // previous values
```

### Pivot models

Logging a pivot requires a real primary key — add `$table->id()` in the migration and set `$incrementing`:

```php
use Illuminate\Database\Eloquent\Relations\Pivot;
use Spatie\Activitylog\Models\Concerns\LogsActivity;

final class ClinicUser extends Pivot
{
    use LogsActivity;

    public $incrementing = true;
}
```

## Manual logging (activity() helper)

For domain events. Keep these calls in actions/services, not controllers.

```php
use App\Models\Patient;
use App\Models\User;

activity('patient')                          // first arg = log name (optional)
    ->causedBy($user)                        // who did it (defaults to auth user)
    ->performedOn($patient)                   // the subject
    ->withProperties(['source' => 'import', 'ip' => request()->ip()])
    ->event('imported')
    ->log('Patient imported from CSV');
```

**A login logger** (no model subject, just a causer):

```php
use Spatie\Activitylog\Models\Activity;
use App\Models\User;

public function recordLogin(User $user): void
{
    activity('auth')
        ->causedBy($user)
        ->withProperty('ip', request()->ip())
        ->event('login')
        ->log(':causer.email logged in'); // placeholders resolve at log time
}
```

Placeholders `:causer.*`, `:subject.*`, and `:properties.*` are substituted from the causer model, subject model, and properties array.

**Reading a logged activity:**

```php
$activity = Activity::all()->last();

$activity->description;          // 'Patient imported from CSV'
$activity->causer;               // the User model
$activity->subject;              // the Patient model
$activity->getProperty('source'); // 'import'
```

**Anonymous events** (no causer) and **runtime causers in jobs** (where there's no authenticated user):

```php
use Spatie\Activitylog\Facades\Activity;

// No causer:
activity()->causedByAnonymous()->log('Scheduled cleanup ran');

// Force a causer for a block of code (e.g. acting on behalf of an admin in a job):
Activity::defaultCauser($admin, function () use ($patient): void {
    $patient->update(['status' => 'archived']); // logged with $admin as causer
});
```

The causer is **not** carried across the queue boundary — a worker has no authenticated user. Pass the causer into the job and wrap the work in `defaultCauser()` inside `handle()`:

```php
public function __construct(private readonly Clinic $clinic, private readonly User $admin) {}

public function handle(): void
{
    Activity::defaultCauser($this->admin, function (): void {
        $this->clinic->update(['is_active' => false]); // attributed to $admin
    });
}
```

## Multiple logs

Group related activity under a named log so you can query each stream separately. Set it per-model with `useLogName()` (shown above) or per manual call with the first `activity()` argument:

```php
activity('billing')->causedBy($user)->log('Invoice generated');
activity('auth')->causedBy($user)->event('login')->log('Logged in');
```

Query a specific log with the `inLog` scope (variadic — accepts multiple):

```php
use Spatie\Activitylog\Models\Activity;

Activity::inLog('auth')->get();
Activity::inLog('auth', 'billing')->get();
Activity::inLog(['auth', 'billing'])->get();
```

## Grouping by a custom column & global enrichment

`log_name` groups activities into streams, but for a cross-cutting dimension you filter on
often (e.g. a tenant `organisation_id`), add a real column and populate it globally.

**1. Add the column** in a follow-up migration (the package's own migration is already
published):

```php
Schema::table('activity_log', function (Blueprint $table): void {
    $table->foreignUuid('organisation_id')->nullable()->index();
});
```

**2. Populate it for every activity.** Manual *and* model-event logs both funnel through
`LogActivityAction::execute()`, which runs every callback registered with
`Activity::beforeLogging()` right before the row is saved. Register one in a service provider's
`boot()`:

```php
use Spatie\Activitylog\Contracts\Activity as ActivityContract;
use Spatie\Activitylog\Facades\Activity;

public function boot(): void
{
    Activity::beforeLogging(function (ActivityContract $activity): void {
        /*
         * Stamp the acting tenant + request metadata onto every entry.
         * ??= so an explicit caller-set value wins.
         */
        $activity->organisation_id ??= resolve(OrganisationContext::class)->id();

        $activity->properties = $activity->properties->merge(array_filter([
            'ip' => request()->ip(),
            'user_agent' => request()->userAgent(),
        ]));
    });
}
```

- Fires for the trait *and* the `activity()` helper — one place to enrich everything.
- **Register once** in `boot()`. `beforeLogging` appends to a static array, so registering
  per-request (e.g. in middleware) accumulates duplicate callbacks — matters under Octane.
- Resolve services and `request()` *inside* the closure (write time); never capture them.

**3. Query the column** like any other:

```php
Activity::query()->where('organisation_id', $id)->latest()->get();
```

## Querying activities

The `Activity` model ships query scopes:

```php
use Spatie\Activitylog\Enums\ActivityEvent;
use Spatie\Activitylog\Models\Activity;

Activity::causedBy($user)->get();                  // everything this user did
Activity::forSubject($patient)->get();             // this record's full history
Activity::forEvent('login')->get();                // by event name
Activity::forEvent(ActivityEvent::Updated)->get(); // or the enum
Activity::inLog('patient')->forSubject($patient)->latest()->get(); // chain them

// Custom properties are JSON — query with arrow paths:
Activity::where('properties->source', 'import')->get();
```

`ActivityEvent` (`Spatie\Activitylog\Enums\ActivityEvent`) has `Created`, `Updated`, `Deleted`, `Restored`.

## Disabling logging

Disable globally for a block of work (bulk imports, seeders, migrations):

```php
activity()->withoutLogging(function (): void {
    Patient::factory()->count(10_000)->create(); // none of these log
});
```

Toggle manually if you need finer control (re-enable in a `finally`):

```php
activity()->disableLogging();
// ... work that must not log ...
activity()->enableLogging();
```

Disable for a single model instance:

```php
$patient->disableLogging()->update(['status' => 'active']); // this write won't log
$patient->enableLogging();
```

Globally off via env: set `ACTIVITYLOG_ENABLED=false` (config key `activitylog.enabled`).

## Cleaning up

The `activity_log` table grows fast. Prune records older than `activitylog.clean_after_days` (default 365):

```bash
php artisan activitylog:clean              # uses clean_after_days from config
php artisan activitylog:clean --days=30    # override retention for this run
php artisan activitylog:clean auth         # only the 'auth' log
php artisan activitylog:clean --force      # skip the production confirmation prompt
```

Schedule it in `routes/console.php`:

```php
use Illuminate\Support\Facades\Schedule;

Schedule::command('activitylog:clean --force')->daily();
```

## Common Mistakes

**Using the old v4 trait namespace.** v5 moved the trait. Import from `Models\Concerns`:

```php
// ❌ v3/v4 — does not exist in v5
use Spatie\Activitylog\Traits\LogsActivity;

// ✅ v5
use Spatie\Activitylog\Models\Concerns\LogsActivity;
```

**Logging sensitive attributes.** `logAll()` / `logFillable()` will happily record passwords, tokens, and secrets into the audit table. Always exclude them:

```php
LogOptions::defaults()->logFillable()->logExcept(['password', 'remember_token', 'api_token']);
```

**Noisy, useless logs.** Without `logOnlyDirty()` every update logs every watched attribute even when unchanged, and without `dontLogEmptyChanges()` you get rows describing zero changes. Use both on automatic logging.

**N+1 when reading causer/subject.** `$activity->causer` and `$activity->subject` are morph relations — lazy loading them in a loop is N+1 per record. Eager load:

```php
Activity::with(['causer', 'subject'])->forSubject($patient)->get();
```

**Pivot without an `id`.** A pivot model using `LogsActivity` silently won't log unless its table has a `$table->id()` primary key and the model sets `public $incrementing = true;`.

**Confusing the two before-logging hooks.** The per-model `beforeActivityLogged(Activity $activity, string $eventName)` method mutates one model's activities; the global `Activity::beforeLogging(fn ($activity) => ...)` facade hook (registered in a service provider) applies to *every* activity. Use the model method for model-specific tweaks.

**Two classes named `Activity`.** Writing logs uses the **facade** `Spatie\Activitylog\Facades\Activity` (for `defaultCauser`, `beforeLogging`, `withoutLogging`); reading/querying uses the **model** `Spatie\Activitylog\Models\Activity` (for `causedBy`, `forSubject`, `inLog` scopes). If one file needs both, alias one — e.g. `use Spatie\Activitylog\Facades\Activity as ActivityLog;` — or they collide.

**Caching the log name across calls.** `useLog()` / `inLog()` set `log_name` on the *current* entry — not a durable default. After each `log()` the builder resets, and the next entry's `log_name` reverts to the configured default (`activitylog.default_log_name`). So when you wrap the builder in a long-lived service, set the name **per entry**, never once in the constructor:

```php
// ❌ first entry logs to 'auth'; every later one silently falls back to the default log
public function __construct(PendingActivityLog $log)
{
    $log->useLog('auth');
    $this->logger = $log->logger();
}

// ✅ apply it on each call
protected function activity(): ActivityLogger
{
    $this->pendingLog->useLog('auth'); // forwards to the wrapped logger
    return $this->pendingLog->logger();
}
```
