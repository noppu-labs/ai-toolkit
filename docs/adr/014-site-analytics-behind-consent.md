# ADR-014: Site analytics behind consent

## Status

Accepted. Builds on [ADR-012](012-astro-for-the-project-website.md) (the Astro site and its
islands).

## Context

toolkit.noppu.com had no way to tell which pages get read. Google Analytics sets cookies, so
visitors in the EU and the UK generally have to agree first, and the site is static: a page
does not know which country its visitor is in. PR previews and local builds serve the same
pages and must not count anyone.

noppu.com will share a Google Analytics property with this site, because a visitor who moves
from the open source tools to the services site is one of the journeys worth seeing.

## Decision

### One web stream for both sites

Both sites use one web data stream, as Google recommends for one user journey. A second stream
would split that journey. Reports tell the sites apart by hostname.

### Basic consent mode, asked worldwide

Google's tag does not load until the visitor allows it, so a visitor who declines sends Google
nothing. Advanced consent mode would load the tag for everyone and send cookieless pings first.

The banner shows worldwide because limiting it by region would add a location lookup to every
page. The ad consent settings stay denied: the site runs no ads.

### The host decides at runtime, not the build

`isAnalyticsHost` compares the page's hostname with production's. Previews and local builds run
the same built files as production, so what a preview tests is what ships. A build-time switch
would need a Workers Builds variable and a build that tests never see.

The footer's Cookie settings button still opens the banner on a preview, so its design can be
reviewed there. Choosing starts nothing.

### A bundled island, not an inline head script

`ConsentBanner` is a `client:idle` island that starts the tag for returning visitors who allowed
it. Google's guide places its tag first in the `<head>`, but this tag has to wait for consent
anyway. Starting it at idle keeps it away from the first render, and a visitor who leaves before
then goes uncounted.

### No Partytown

Partytown would move the tag to a web worker. Measured on the home page with 4× CPU throttling
and the real tag, the tag added about 70 ms of blocking time and no change to LCP or CLS, for
visitors who allowed it and nobody else. That does not justify a service worker and forwarding
config, and Partytown's own docs say GA4's `user_engagement` event is not reliable from a worker.

## Consequences

- Reports count only visitors who allow analytics, so the numbers run low. They suit comparing
  pages better than counting total visitors.
- Every new page gets the banner and the tag through `Base.astro`. `404.html` stands alone and is
  not measured.
- noppu.com needs the same tag, measurement ID and consent cookie. The cookie's name and domain
  are the contract between the two sites.
- A new cookie or storage key has to be added to the table on the privacy page. Measuring
  something new means asking visitors again.
- A page-level Content-Security-Policy, if one is added later, has to allow Google's domains.
