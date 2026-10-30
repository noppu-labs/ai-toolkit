# ADR-012: Astro for the project website

## Status

Accepted. Supersedes [ADR-011](011-prerendered-site-pages.md), keeping its URLs, skill pages
and head values. Builds on [ADR-008](008-project-website-on-github-pages.md) (content
pipeline) and [ADR-010](010-project-website-on-cloudflare-workers.md) (hosting).

## Context

ADR-011 prerendered toolkit.noppu.com with a three-step build and a hand-written script.
`vite build` wrote the client bundle, a second Vite build turned the same React tree into a
Node module, and `scripts/prerender.ts` rendered each page with `renderToString`. The script
gave each page its head by swapping its title, description, canonical link and `og:url` into
the home page's built `index.html`, and it also wrote the sitemap. In the browser, every page
loaded the one client bundle, and `createRoot` replaced the prerendered markup with a fresh
render.

The site's next content is pages for the OpenCode plugins, blog posts and a case study.
Under ADR-011, each new page type would add to that pipeline: a route in `pageAt`, head
values swapped into a template written for the home page, sitemap entries, and Markdown
rendering and an RSS feed written by hand. Each of those pages would also load the whole app
and render it again, a blog post with nothing interactive on it included.

## Decision

The site is an Astro 7 project (`astro` ^7.4.4, with `@astrojs/react` and
`@astrojs/sitemap`), and its build writes static files to `site/dist`. Astro prerenders every
page by default, gives each page its own head, has typed content collections and official
sitemap and RSS packages, and renders React components, so the existing ones carry over.

React Router 8 and TanStack Start would also have kept the components, and both were
rejected. React Router 8 has no official Markdown, sitemap or RSS support, so the site would
maintain all three itself. TanStack Start was too new to build on: its first stable release
came out on 2026-10-12, the move from its release candidates removed APIs, and its docs say
nothing about RSS.

### Pages and islands

`site/astro.config.ts` sets `site: "https://toolkit.noppu.com"`, `trailingSlash: "never"` and
`build: { format: "directory" }`. `src/pages/index.astro` is the home page.
`src/pages/skills/[name].astro` makes one page per skill, which Astro writes to
`skills/<name>/index.html` and Cloudflare serves at `/skills/<name>` (ADR-010). As under
ADR-011, no URL past the root ends in a slash, sitemap entries included.
`src/layouts/Base.astro` writes each page's head from `HOME_HEAD` and `pageHead` in
`src/lib/pages.ts`, which hold ADR-011's values.

An island is a component that an `.astro` file renders with a `client:` directive, and that
Astro hydrates in the browser. A React component rendered without a directive becomes static
HTML, and so does everything it renders. A section with any interactive element, such as a
Copy button or a saved preference, therefore hydrates as a whole:

| Section                                                        | Directive     |
|----------------------------------------------------------------|---------------|
| Header with `ThemeSync`; catalog                               | `client:load` |
| Install, plugin cards, security, footer; a skill page's detail | `client:idle` |
| Hero, band; a skill page's breadcrumb, card and other skills   | none          |

The header and the catalog hydrate at once, because the theme toggle and the phone menu must
work immediately and a `?skill=` deep link opens its pane or sheet on load. The rest hydrate
when the browser is idle.

The page frame and the skill page stay React components (`SiteFrame.tsx`, `SkillPage.tsx`)
that render as static HTML and take their islands from the `.astro` files as slots, so the
Tailwind markup stays in `.tsx` files. `Base.astro` keeps `<div id="root">` around the frame.
`app.css` makes it an isolation root, which keeps Base UI's popups, portalled into `<body>`,
above the sticky header. Sections share state only through the URL and the persisted Zustand
store, never through React context, so splitting the page into islands breaks no link
between them.

### The catalog collection

`src/content.config.ts` defines one collection, `catalog`. Its loader calls `buildCatalog`
from `scripts/build-catalog.ts`, which reads the marketplace manifest, each `plugin.json` and
each SKILL.md as ADR-008 describes, and returns a single entry that holds the whole catalog.
A Zod schema from `astro/zod` (`src/lib/catalog-schema.ts`) checks the entry without adding a
dependency. One entry keeps the `Catalog` type that every consumer already takes, where a
collection of skills would have changed them all. Pages read the catalog only through
`loadCatalog` (`src/lib/load-catalog.ts`), so a different content source would change the
loader and leave the pages alone. `src/generated/catalog.json` is gone, along with the `pre*`
scripts that wrote it.

### Hydration

Each island hydrates the HTML the build wrote, through React's `hydrateRoot`. ADR-011 used
`createRoot` because a hydrating render reads the build's values: no media query matches,
the URL has no parameters and the theme is light. That is now what makes hydration match.
The hooks that read the browser (`useMediaQuery`, `useSearchParam`, `useResolvedTheme` and
`usePrerendering`) return the build's values during the hydration render, and the visitor's
from the next render on. `usePrerendering()` is true in the build and in the hydration
render.

Two parts of the catalog changed for this:

- `useExpandedGroups` lost its `initial` argument. That initializer opened a phone deep
  link's group when the linked skill sat past the fold, and during hydration it would have
  seen the build's values, with no linked skill. An effect now makes the decision on the
  first render after hydration, and a ref limits it to that render. Focus still returns to
  a deep-linked row past the fold when the phone sheet closes.
- The scroll-to-fragment hook, `useScrollToHashOnLoad`, runs in the catalog island and
  waits before it scrolls to a `#fragment`, because islands that hydrate on idle can change
  height after the catalog has: a saved skills CLI preference shortens the install section.
  The hook waits for `whenIslandsHydrated()` (`src/lib/islands.ts`), which resolves once no
  island carries Astro's `ssr` attribute, or after 3 seconds. Astro removes that attribute
  when it hands an island to React, which hydrates it later in a transition, so the hook
  then also waits for an idle callback, or 200 ms where the browser has no
  `requestIdleCallback`.

### Biome and type checking

The root `biome.json` turns on `html.experimentalFullSupportEnabled`, with the HTML formatter
and linter. Biome then lints and formats each `.astro` file's frontmatter and markup under
the repo's rules, with no overrides (ADR-004). Two rules miss `.astro` files:
`useSortedClasses` on the markup's `class` attributes, and `useConst` in the frontmatter.
`.astro` files therefore hold only layout, data loading through typed helpers and island
wiring, and markup with Tailwind classes stays in `.tsx`. The flag also brings the SVG and
HTML files in `site/public/` under Biome's formatter and linter. Its HTML linter reports
`noUnknownAttribute` on the font preloads' `crossorigin`, which is valid HTML, and
`Base.astro` annotates that one site with a reasoned `biome-ignore`, as ADR-004 allows.

`astro check` is not used. `@astrojs/check` 0.9.12 requires TypeScript `^5.0.0 || ^6.0.0`,
and the repo is on TypeScript 7.0.2, whose package has no JavaScript compiler API. The
site's typecheck is `astro sync && tsc --noEmit`: `astro sync` runs the loader and writes the
collection's types, and `tsc` checks the site's `.ts` and `.tsx` files. `.astro` frontmatter
only calls typed helpers that `tsc` checks.

`.node-version` pins Node 24, which Workers Builds reads, and `site/package.json` requires
Node 22.23.4 or later (`engines`), Astro 7's minimum. CI runs Node 24.

### Tests

The component tests run as before, from a `vitest.config.ts` kept apart from Astro's config.
A new `dist` Vitest project tests the production build: it serves `site/dist` with
`astro preview` and drives Chromium through the Playwright library. It checks each page's
head, the sitemap and the 404 page. It also hydrates the home page at phone and desktop
widths, bare and with a deep link, a filtered catalog, the dark theme or a saved install
method, and any console error or warning fails the test. The tests workflow runs it after
`npm run build -w site`. `App.test.tsx`'s page checks moved there. The real-catalog cases of
two library tests moved to `scripts/catalog-coverage.test.ts`, which calls `buildCatalog`.

### Sitemap

`@astrojs/sitemap` writes `sitemap-index.xml`, which lists `sitemap-0.xml`. Its
`filenameBase` option changes only the prefix, so it cannot write the `sitemap.xml` that
ADR-011's build wrote. `robots.txt` names the index, and `site/public/_redirects` sends
`/sitemap.xml` to it with a 301, which Cloudflare applies to static assets. If the old
address was submitted to Google Search Console, the new one has to be submitted there too.

### Preview checks

`astro preview` does not apply Cloudflare's URL rules: the dropped trailing slash,
`_redirects`, and the headers that `_headers` adds: the security headers on every page and
`X-Robots-Tag: noindex` on previews.
`.github/workflows/preview-checks.yml` tests them on each pull request's Cloudflare preview.
Workers Builds runs outside GitHub Actions, so no job can wait for it with `needs:`. The
workflow starts instead when the "Workers Builds: ai-toolkit" check succeeds on a pull
request (a `check_run` event), and only if that check run comes from the
`cloudflare-workers-and-pages` GitHub App. It reads the preview's address from the check's
`details_url`, and waits up to a minute for the preview to serve the pull request's commit,
which each Workers Builds build names in a `build-commit` meta tag. Cloudflare documents that
`drop-trailing-slash` redirects `/skills/<name>/` to `/skills/<name>` with a 307. The checks
expect that, and also expect `/skills/<name>` to answer 200, `/skills/<name>.html` to
redirect to it, an unknown path to get the 404 page, the preview to send `noindex` and the
security headers, and `/sitemap.xml` to redirect to the index with a 301.

GitHub runs a `check_run` workflow only from the default branch. The workflow therefore
checks out the default branch's tests, with `persist-credentials: false`, and never the pull
request's code. Running that code there would put it in a job holding a token that can
write commit statuses: the untrusted-checkout pattern that OpenSSF Scorecard's
Dangerous-Workflow check flags in `pull_request_target` and `workflow_run` workflows
(ADR-007). Because the run belongs to the default branch, its own check attaches there too,
so the workflow reports as a commit status, "Cloudflare preview checks", on the pull
request's head commit. A failing preview fails only that status: the tests step may fail
without failing the run, whose own check would otherwise show red on the default branch.
When a newer push has replaced the preview, the run posts success only if GitHub's compare
API says the preview's commit is ahead of the one it was asked to test.

### Dependencies

Each package in the lockfile is part of the supply chain ADR-007 hardens, since CI and
Cloudflare's build install it. Each one Astro adds is one more package that Dependabot
updates and review must trust, under ADR-007's pinning and Scorecard checks.
`jq '.packages | length' package-lock.json` goes from 577 before the move to 784 after it.
That counts every entry in the lockfile's `packages` map: the root, the two workspaces and
their two links, and every installed package path, nested copies included. By distinct
package name, the count goes from 522 to 700. The three new packages are dev dependencies of
the `site` workspace.

## Consequences

### Positive

- A new page type, such as the OpenCode plugin pages or blog posts, needs only a collection
  and a page file. Astro routes the page and adds it to the sitemap, and `Base.astro` writes
  its head.
- Pages hydrate the HTML they were built with, where ADR-011's pages rendered again on load.
  The hero, the band, and everything on a skill page outside the header, footer and skill
  detail ship no JavaScript.
- `npm run build -w site` is one `astro build`. The second Vite build, `scripts/prerender.ts`
  and the generated catalog are gone, and with them ADR-011's risk of a Cloudflare build
  command that skips the prerender and deploys without skill pages or a sitemap.
- The tests workflow runs the production build in Chromium in each hydration state above,
  and a console error or warning in any of them, React's hydration error #418 included,
  fails it.

### Negative

- The lockfile grows by 207 entries, from 577 to 784, and each one is code to keep updated
  and to trust.
- Biome's `.astro` support is experimental, as the flag's name says, and a Biome release can
  change what it lints or how it formats. Dependency updates run lint in CI, which would show
  such a change. While `useSortedClasses` and `useConst` miss `.astro` files, Tailwind
  classes and logic stay out of them.
- Astro's major versions run from 1.0 in August 2022 to 7.0 in June 2026, with 6.0 in March
  2026. Each major upgrade is its own pull request, and 2026 has had two.
- `.astro` frontmatter and the props passed in `.astro` markup are not type-checked. A wrong
  prop, or a type annotation that does not match its value, still builds, and only a
  built-site test that looks at the rendered page can catch it.
- Sections with `client:idle` hydrate a moment after load. Until then their buttons do
  nothing, and the install section, plugin cards and skill detail show the default install
  method rather than a saved one. The built-site tests require every island to start
  hydrating within 2 seconds of the `load` event.
- The built-site tests run the production build. There React reports mismatched text or
  elements during hydration (error #418), but it leaves a mismatched attribute as the build
  wrote it and logs nothing. A hook that gives an attribute another value on the hydration
  render passes the tests unless one checks that attribute.
- The home page carries the plugin data twice, once in the plugin cards' props and once in
  the catalog's: about 4 kB of the page's 24 kB gzipped. Embedding it once would change
  `PluginCards`' props and its tests.
- Contributors need Node 22.23.4 or later to build the site, up from Node 20.
- GitHub runs the preview workflow only from the default branch, so it first runs on the pull
  request after the one that adds it, and a change to the workflow or to the preview tests
  takes effect only once merged. The pull request that adds it needs its preview checked by
  hand.
- The preview workflow depends on Workers Builds linking its check to a URL that contains
  `previews/<alias>/builds/`. If Cloudflare changes that link, the workflow fails with an
  error and tests nothing until it is updated.
- The workflow also finds the check by its name and its GitHub App, and that is the one
  dependency that fails silently. If the Worker is renamed, or the app's slug is not
  `cloudflare-workers-and-pages`, every run skips its job without posting a status, so
  nothing on a pull request says that its preview went untested.
