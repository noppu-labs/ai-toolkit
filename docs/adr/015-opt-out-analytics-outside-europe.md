# ADR-015: Opt-out analytics outside Europe

## Status

Accepted. Amends [ADR-014](014-site-analytics-behind-consent.md): its "asked worldwide" decision
and the consequence that Google's cookies are expired when there is no answer.

## Context

ADR-014 asks every visitor before Google Analytics loads, because the static site could not tell
where a visitor is. Most visitors outside Europe never answer, so the reports counted only a
small share of real traffic.

Consent before analytics cookies is required in the European Economic Area, the UK and
Switzerland. Elsewhere, telling visitors and letting them opt out is the common practice.

## Decision

### The Worker decides the region

`GET /api/consent-mode` returns `{"mode": "opt-in"}` or `{"mode": "opt-out"}` from
`request.cf.country`, which Cloudflare sets on every request. The path is already under
`run_worker_first`, so pages stay static assets. The response is `private, max-age=3600`, so
a visitor's browser asks at most once an hour and no shared cache mixes visitors up.

The opt-in list is the EEA, the UK and Switzerland, plus the regions ISO codes separately
(Åland, the French outermost regions, Gibraltar, Svalbard and Jan Mayen, and the Crown
dependencies). A missing country, Cloudflare's `XX` and Tor's `T1` are opt-in: a wrong guess
must never count a visitor who should have been asked.

Rejected:

- Consent mode's `region` parameter lets Google pick the default per country, but its tag has to
  load for everyone first. In Europe that is Advanced consent mode, which ADR-014 rejected.
- A Europe/* timezone check needs no request, but misreads VPNs, travellers, UTC clocks, and
  timezones such as Europe/Moscow.
- Consent libraries such as vanilla-cookieconsent have an opt-out mode but no geolocation, and
  hosted CMPs that geolocate cost money and replace a reviewed banner.

### The browser can still ask first

A visitor whose browser sends Global Privacy Control is opt-in wherever they are, and the
browser does not call the Worker. Any answer other than `opt-out`, an error status, a body that
is not JSON, a network failure and a 3-second timeout all fall back to opt-in.

### Nothing changes without an answer until the mode is known

A visitor who allowed or declined is handled straight away, as before. For a visitor with no
answer or only an acknowledgement, the banner waits for the mode before starting or stopping
anything. Expiring `_ga*`
while the lookup is in flight would make an opt-out region's visitor a new visitor on every page.

### The notice reuses the cookie

Outside Europe the banner says "We count visits", with Got it and Opt out at equal weight. Got
it writes `acknowledged`. Opt out and No thanks (the decline button in the opt-in prompt and in
Cookie settings) write `denied`, and Allow analytics (the opt-in prompt or Cookie settings)
writes `granted`. All three go to the same `noppu_analytics_consent` cookie, so
noppu.com and returning visits read one answer. The page writes the cookie at once, and then,
on production, the Worker rewrites it.

`acknowledged` is not consent. It counts only where the opt-out mode applies. In opt-in mode
(Europe, or a browser sending GPC) a visitor with `acknowledged` is asked like a visitor with
no answer. The cookie contract with noppu.com now has three values, and noppu.com must treat
`acknowledged` the same way.

## Consequences

- Reports count most visitors outside Europe, and still only consenting ones inside it.
- The Worker now sees visitors, not only badge hits. The `/api/consent-mode` answer is cached in
  the browser for an hour, so a visitor costs about one Worker request an hour, plus one
  `POST /api/consent` per answer and the badge requests. The Workers Free plan allows 100,000
  requests a day, reset at midnight UTC ([limits](https://developers.cloudflare.com/workers/platform/limits/),
  [pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Past that, Cloudflare
  returns error 1027, so the badge and the lookup fail together and the page falls back to
  opt-in. Workers Logs on the Free plan take 200,000 events a day and keep them 3 days
  ([pricing](https://developers.cloudflare.com/workers/platform/pricing/)), and traces are kept
  7 days ([traces](https://developers.cloudflare.com/workers/observability/traces/)). From
  1 December 2026, Workers Logs and stored traces are billed under Cloudflare Observability
  pricing. Sampling is at 100% in
  `wrangler.jsonc`, so every request writes log events against that limit.
- A visitor whose country changes, through travel or a VPN, keeps the cached mode for up to an
  hour.
- `_ga*` cookies are expired when the answer is `denied`, or when the mode is opt-in and the
  answer is missing or `acknowledged`. noppu.com must apply the same rule, with the same country
  list, before it sets Google's cookies without a `granted` answer.
- Safari caps script-written cookies at 7 days but not cookies set by the site's own server. The
  Worker's `POST /api/consent` re-sets the cookie with `Set-Cookie`, so an answer lasts its 6
  months there too. It checks `Origin`, so another site cannot record an answer. noppu.com must do
  the same, or its answers lapse in Safari after a week.
- Off `toolkit.noppu.com` the banner island makes no lookup and shows no prompt, so local builds,
  `astro preview` and preview deployments never reach the Worker; only Cookie settings opens the
  banner. The dist tests serve the build at production's address and stand in for the Worker, which
  is how they exercise the lookup.
