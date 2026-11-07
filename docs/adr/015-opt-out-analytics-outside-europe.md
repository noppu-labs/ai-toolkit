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
(Åland, the French outermost regions, Gibraltar and the Crown dependencies). A missing country,
Cloudflare's `XX` and Tor's `T1` are opt-in: a wrong guess must never count a visitor who should
have been asked.

Rejected:

- Consent mode's `region` parameter lets Google pick the default per country, but its tag has to
  load for everyone first. In Europe that is Advanced consent mode, which ADR-014 rejected.
- A Europe/* timezone check needs no request, but misreads VPNs, travellers, UTC clocks, and
  timezones such as Europe/Moscow.
- Consent libraries such as vanilla-cookieconsent have an opt-out mode but no geolocation, and
  hosted CMPs that geolocate cost money and replace a reviewed banner.

### The browser can still ask first

A visitor whose browser sends Global Privacy Control is opt-in wherever they are, and the
browser does not call the Worker. The Worker's answer, an error status, a body that is not JSON,
a network failure and a 3-second timeout all fall back to opt-in.

### Nothing changes without an answer until the mode is known

A visitor who has answered is handled straight away, as before. For a visitor without an
answer, the banner waits for the mode before starting or stopping anything. Expiring `_ga*`
while the lookup is in flight would make an opt-out region's visitor a new visitor on every page.

### The notice reuses the cookie

Outside Europe the banner says "We count visits", with Got it and Opt out at equal weight. Got
it writes `granted` and Opt out writes `denied` to the same `noppu_analytics_consent` cookie, so
noppu.com and returning visits read one answer.

## Consequences

- Reports count most visitors outside Europe, and still only consenting ones inside it.
- Every page view on production with no cached mode makes one Worker request. This is well within
  the free plan at the site's traffic.
- `_ga*` cookies are expired when the answer is `denied`, or when there is no answer and the
  mode is opt-in. noppu.com must apply the same rule, with the same country list, before it sets
  Google's cookies without a `granted` answer.
- Safari caps script-set cookies at 7 days, so an opt-out in Safari lapses after about a week and
  analytics starts again until the visitor opts out again. Setting the consent cookie from the
  Worker with a `Set-Cookie` header would avoid the cap.
- Local builds and `astro preview` have no Worker, so the lookup 404s and the page asks first. The
  dist tests stand in for the Worker.
