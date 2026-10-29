# ADR-011: Prerendered site pages

## Status

Superseded by [ADR-012](012-astro-for-the-project-website.md), which builds the site with
Astro and keeps this decision's URLs, skill pages and head values. Builds on
[ADR-008](008-project-website-on-github-pages.md) (content pipeline) and
[ADR-010](010-project-website-on-cloudflare-workers.md) (hosting).

## Context

The site was a client-rendered React app. The `index.html` that toolkit.noppu.com served was
about 5 kB with an empty `<div id="root"></div>`: every heading, plugin and skill came from a
470 kB script. Google renders JavaScript, but later and at a lower priority. Bing is less
reliable at it, and the AI crawlers (GPTBot, ClaudeBot, PerplexityBot) and link previews do
not run it at all. What they saw was the `<noscript>` box, whose text said the catalog needs
JavaScript.

Skills, the actual product, had no URLs of their own. A skill was reachable only as
`/?skill=<name>#skills`, through catalog rows that were buttons, under the home page's
canonical link. Someone searching for what a skill does could not land on it.

## Decision

The build renders every page to HTML in Node. `npm run build -w site` runs three steps:

1. `vite build`: the client bundle and `dist/index.html`, as before.
2. `vite build --ssr src/entry-server.tsx --outDir dist-server`: the same React tree as a
   Node module. It must sit inside `site/`, so its bare imports resolve from `node_modules`.
3. `tsx scripts/prerender.ts`: renders each page with `renderToString` and writes it out.

`scripts/prerender.ts` writes three things into `dist/`:

- The home page over `index.html`.
- One `skills/<name>.html` per skill. Cloudflare serves it at `/skills/<name>`, and
  307-redirects `/skills/<name>/` and `/skills/<name>.html` there. Page URLs have no
  trailing slash past the root, because it looks cleaner. Every link, canonical link and
  sitemap entry uses that one form.
- `sitemap.xml`, listing every page.

Each page's head comes from swapping the home page's title, description, canonical link and
`og:url` in the built `index.html`. `src/lib/pages.ts` holds those home values, and a test
keeps them in step with `index.html`. If the template no longer carries one of them, the
build fails rather than shipping the home page's head on every skill page.

A skill page shows what the catalog's pane shows, under the skill's name as the page's only
`h1`. It adds a breadcrumb back to the catalog and links to the plugin's other skills.
Catalog rows are real links to these pages. A plain click or Enter still opens the pane or
the sheet in place, and a modified click is left to the browser. "Copy link" shares the
skill's page. Old `/?skill=<name>` links keep working. Skill names must be lowercase letters,
digits and single hyphens (the Agent Skills naming rule), because each becomes a URL path
segment and a directory under `dist/`.

At build time no media query matches, there are no URL parameters, and the theme is light.
The prerender is therefore the phone layout, with one difference: every catalog row is
expanded, so the home page links all skill pages. `usePrerendering()` is true only there.

In the browser, `main.tsx` keeps `createRoot`, which replaces the prerendered markup when the
script runs. It does not use `hydrateRoot`. URL parameters, the viewport and stored
preferences differ from the build's defaults on many visits, and hydration would serve every
first-render read the build's values. For example, `useExpandedGroups`' initializer would see
no deep-linked skill, and focus could not return to a phone deep link's row past the fold.
Rendering afresh keeps the client exactly as it was. Build-time-only values, such as the
expanded catalog, cost the client nothing.

The `<noscript>` box is gone. The prerendered page carries every section and install
command, and the box would have repeated them for crawlers.

## Consequences

### Positive

- Crawlers that do not run JavaScript, AI crawlers and link previews see the whole page.
- The first paint no longer waits for the script.
- Every skill has an indexable URL with its own title, description and canonical link.
  The sitemap lists them, and the home page links each one.

### Negative

- A module that reads `window`, `document` or `localStorage` when imported breaks the
  build. `scripts/render-in-node.test.ts` renders every page in Vitest's Node project and
  catches it first.
- Until the script runs, the catalog shows every row with no desktop pane. The page then
  shifts when long groups collapse. This is below the fold, and the scroll-to-fragment hook
  scrolls again once the app is on screen.
- On load, the app replaces the prerendered markup. Anything typed into the search box
  before then is lost.
- Visitors whose browser runs JavaScript, nearly all of them, keep every control as before.
  For a visitor or crawler that does not run it, the search box, plugin chips, theme toggle,
  phone menu and Copy buttons do nothing, though every link, command and description works.
  Before this decision, such a visitor got an empty page.
- Until the script runs, the page shows the build's defaults. A visitor with a dark OS sees
  the dark colours, set by the no-flash script, but the light theme's toggle icon. A visitor
  who chose the skills CLI sees the Claude Code install commands.
- Catalog rows are links, so Space scrolls the page instead of opening a row. Enter opens
  it, as before.
- Cloudflare's build command is configured in its dashboard, outside this repository, and
  must run the site workspace's `npm run build`. A command that skipped only the prerender
  step would deploy the site without its skill pages or sitemap, and `robots.txt` would
  point at a missing file. A bare `vite build` fails outright, because only `prebuild`
  generates the catalog.
