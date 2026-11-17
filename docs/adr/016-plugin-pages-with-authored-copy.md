# ADR-016: Plugin pages with authored copy

## Status

Accepted. Builds on [ADR-012](012-astro-for-the-project-website.md) (the Astro site and its
content collections) and follows the shape of [ADR-013](013-opencode-plugin-pages-from-plugin-manifests.md).

## Context

The site linked to a plugin with a query string on the home page, such as
`https://toolkit.noppu.com/?plugin=review#skills`. The home page's canonical link is `/`, so
search engines treat each of those URLs as a copy of the home page. Search Console lists them
under "Alternate page with proper canonical tag", and none of them can be indexed or show up
in a search for the plugin. They also look less settled than a path.

The fix is a real page for each plugin, at `/plugins/<name>`, with its own canonical link and
a sitemap entry. A page built only from catalog data (the description, counts, install
commands and skill list) would repeat what the home page already shows. Google may crawl a
page like that and decline to index it, which would defeat the purpose.

## Decision

### A page per plugin

The site prerenders `/plugins/<name>` for every plugin in the catalog. The page has a hero
with install commands for each host, highlights, the plugin's skills, how it works,
requirements, questions and links to the other plugins. Every link on the site, in the README
and in each `plugin.json` homepage points at these pages.

### Authored copy in a manifest, catalog data for the rest

Each plugin has one manifest, `site/src/content/plugins/<name>.yaml`, loaded as the `plugins`
content collection. It holds the headline, SEO title and description, tagline, highlights,
how it works, requirements, questions and links. A strict schema rejects unknown keys and
caps each text and list. The fields and the rules for writing them are in
[docs/plugin-pages.md](../plugin-pages.md).

Everything that can drift stays out of the manifest and comes from the catalog: the
description, version, counts, install commands and skills. The build joins the two and fails
when a plugin has no manifest or a manifest has no plugin.

The manifests live under `site/` because the plugin directories are what users install and
what a release packages, so site copy kept there would ship to users.

### `/?plugin=` stays as view state

The catalog's filter chips still write `?plugin=<name>` to the home page's address, and the
home page keeps its canonical link. The URL is not redirected, because it is the catalog's
own view state.

### Rejected

- A page built from the catalog alone, in the style of a skill page. It costs the least and
  has the least text of its own, which is the thin-content risk this decision exists to avoid.
- A page with more sections (hero, highlights, skills, requirements) but all of it built from
  catalog data. It costs more to build than a skill-style page and is just as thin.
- Keeping the in-place filter behind a `/plugins/<name>` link, or giving each card two links.
  A plain link has one target and removes a click handler.

## Consequences

### Positive

- Each plugin has an indexable URL with its own title, description, canonical link,
  breadcrumb data and sitemap date.
- Counts, versions, install commands and skills cannot drift, because the page reads them
  from the plugin.
- The copy goes through the same pull request review as code, and tests check its length,
  its overlap with text the site already shows and its dashes.

### Negative

- Every plugin needs copy that someone writes and keeps current. A change to what a plugin
  does means rereading its manifest.
- A new plugin cannot ship without a manifest. The build and the coverage test fail until
  one exists.
- Plugin pages share the site's social image. There is no per-plugin card.
- The `homepage` in each `plugin.json` changes without a version bump, so it reaches users
  only with each plugin's next release. Until then, installed copies still show the old value.
- Copy can still say something the plugin no longer does. The tests check form, not truth,
  so a reviewer has to compare the claims with the plugin's files.
- The page's counts and skill list come from the catalog at build time, while the highlights
  and steps are hand-written. The two can disagree after a plugin changes, until someone edits
  the manifest.
