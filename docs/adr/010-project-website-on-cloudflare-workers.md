# ADR-010: Project website on Cloudflare Workers

## Status

Accepted. Supersedes the hosting part of [ADR-008](008-project-website-on-github-pages.md);
the content pipeline described there is unchanged.

## Context

ADR-008 put the site on GitHub Pages, deployed by a `deploy-pages` workflow. PR previews
already ran on Cloudflare: `wrangler.jsonc` described a Worker that served `site/dist` as
static assets, and Cloudflare's Git integration deployed it per pull request. Production and
previews therefore came from two hosts with two deploy paths.

Two things changed. The `noppu.com` zone moved to Cloudflare, which makes a Worker custom
domain possible for `toolkit.noppu.com`. And we wanted a README badge for the total npm
downloads of every package this repo publishes. shields.io cannot add up several packages,
and npm's bulk downloads API rejects scoped names, so something has to sum the counts at
request time. GitHub Pages cannot run code.

## Decision

Production is the same Worker the previews use, with `toolkit.noppu.com` attached as its
custom domain. Cloudflare's Git integration builds and deploys it on every push to `main`,
and the `deploy-pages` workflow is gone.

`wrangler.jsonc` keeps `site/dist` as the assets directory and adds a small script,
`worker/index.ts`:

- `/api/badges/npm-downloads` runs the script first (`run_worker_first: ["/api/*"]`). It sums
  the all-time downloads of every npm name in `worker/npm-downloads.ts`, fetching npm's point
  API in windows of at most 365 days because npm silently clamps longer ranges, and answers
  in the shields.io endpoint format. The result is cached at the edge for six hours, and a
  copy is kept for 30 days so an npm outage serves the last good number.
- Every other path is served from the static assets without running the script, and a miss
  still gets `404.html`.

A test reads every `package.json` and `release.yml`'s `UNSCOPED_NAMES` and fails if the
Worker's package list differs, so a new package cannot be left out of the total.

## Consequences

### Positive

- One host and one deploy path for production and previews.
- The badge costs nothing in practice: static asset requests are free and unlimited, only
  `/api/*` runs the script, and shields.io plus the edge cache keep that to a few hundred
  requests a day, far inside the free plan's 100,000.
- The total is always within six hours of npm's numbers, with no scheduled job and no
  commits.

### Negative

- The site is no longer purely static files. A broken `worker/index.ts` can fail the deploy,
  so the script stays small and is unit-tested and covered by the coverage gate.
- Hosting now depends on a Cloudflare account and its Git integration, configured outside
  this repository, where GitHub Pages needed only the workflow file.
- The badge depends on npm's downloads API, which reports with about a day's delay.
