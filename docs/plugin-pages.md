# Plugin pages

Each plugin in this repo gets a page on toolkit.noppu.com at
`https://toolkit.noppu.com/plugins/<name>`, for example
`https://toolkit.noppu.com/plugins/review`. The site prerenders it from two sources: the
catalog, which `site/scripts/build-catalog.ts` reads from the plugin's own files, and one
authored manifest, `site/src/content/plugins/<name>.yaml`. [ADR-016](adr/016-plugin-pages-with-authored-copy.md)
explains why the page has copy of its own.

## What the page shows

From top to bottom: a hero (breadcrumb, chips, the `title` as the page's only `h1`, the
tagline, an install box with a tab per host, a GitHub button and, when the plugin has an OpenCode
package, an npm button), highlights, the plugin's skills, how it works, requirements, questions and links to the other plugins.

The skills section has the id `skills`. The plugin cards on the home page and the OpenCode
hub link to it, at `/plugins/<name>#skills`, and every other link goes to the top of the page.

## What comes from the catalog

These are not in the manifest, so they cannot drift from the plugin:

- the plugin's description, version and counts of skills, agents and rules
- the install commands for each host, and the OpenCode package when the plugin has one
- the skills, each with its summary and a link to its page

The sitemap date is not in the manifest either. It is the latest commit to the plugin's
directory or its manifest, which `site/scripts/page-last-modified.ts` reads from git at build
time.

## Fields

Every field is required unless the table says optional. Unknown keys are rejected. Text
fields are trimmed. The limits count characters, and a list's limit counts its items.

| Field | Limit |
| --- | --- |
| `schemaVersion` | The number `1` |
| `title` | 3 to 60 characters. The page's `h1` |
| `seo.title` | 10 to 47 characters. The site appends `· AI Toolkit`, and search results cut a title at roughly 60 characters |
| `seo.description` | 70 to 160 characters |
| `tagline` | 20 to 220 characters |
| `highlights.heading` | 3 to 80 characters |
| `highlights.items` | 3 to 6 items |
| `highlights.items[].label` | 1 to 16 characters |
| `highlights.items[].title` | 3 to 60 characters |
| `highlights.items[].body` | 10 to 260 characters |
| `howItWorks.heading` | 3 to 80 characters |
| `howItWorks.steps` | 2 to 6 items of 10 to 260 characters |
| `requirements.items` | 1 to 8 items of 3 to 200 characters |
| `faq` | 3 to 8 entries |
| `faq[].q` | 5 to 120 characters |
| `faq[].a` | 10 to 400 characters |
| `links` | Optional, 0 to 8 entries |
| `links[].label` | 1 to 40 characters |
| `links[].href` | A URL that starts with `https://` |

`links` render as buttons at the foot of the Requirements section.

The schema is `site/src/lib/plugin-page-schema.ts`.

## Titles

`title` follows `<name>: <subject>`, with the plugin's name first and the subject in plain
words, for example `inertia-react: Inertia and React frontend skills`. `seo.title` is the
title in search results and is written separately. It must not name AI Toolkit, because the
site adds that.

## Text

Text is literal. The only formatting is inline code between backticks, so `pr-review`
renders as code. HTML, Markdown links, emphasis and any other markup show up as typed. An
unmatched backtick shows as a backtick. Backticks render as code in the `tagline`, the
section headings, the highlight titles and bodies, the steps, the requirements, and the
questions and answers. `title`, `seo.title`, `seo.description` and the highlight and link
labels are plain text, so leave backticks out of them. Name a skill in backticks, and only name skills the
plugin ships.

## Writing the copy

A page that repeats the home page's text risks being crawled and left out of the index, so
each manifest says things the site does not already say.

- Read the plugin's `plugin.json`, its README where it has one, every `SKILL.md`, and its
  agents and rules. Every factual claim must come from one of them: no number, version
  requirement or capability that they do not state.
- Do not repeat a sentence from the plugin's description, the marketplace description or a
  skill summary. Say what problem the plugin solves, how its skills fit together, what a
  session with it looks like, what it needs and where it stops. A test fails on any sentence
  of 40 characters or more that is the same as one of those, ignoring case and the
  punctuation that ends it. A reworded or partly copied sentence passes the test, and the
  rule still applies to it.
- Scope each claim to what the source says it for. Words such as "every" and "all" need a
  source that covers every case. Keep the condition when a source states one.
- Write plain, specific English with British spelling and short sentences. Avoid sales
  language, inflated claims, staged contrasts ("not X, but Y"), lists of three added for
  rhythm, and one-line closers that repeat the sentence before. Use no em or en dashes; a test
  fails on them.
- Requirements are what the sources say must be installed. A tool a skill's prompt tells the
  agent to use is behaviour, not a requirement.
- Leave out what the catalog shows. The install box has the install commands, so the copy may
  say that a route exists and what differs on it, but never spells a command out. The chips
  have the counts, so the copy says "the skills" or "its rules" and never how many. Numbers
  that describe behaviour, such as thresholds, limits and versions, stay.
- Write numbers from one to nine as words in running prose, and use digits for versions,
  thresholds and anything in code.
- FAQ questions are ones a person would type into a search box: what the plugin needs, whether
  it works outside Claude Code, how it differs from the plugin next to it, what it does not do.
- Reread the finished text for stock phrasing, then check again that it still says only what
  the sources support and still fits the limits.
- Start the file with two comment lines: the page's URL, and that the fields are documented
  here.

`site/scripts/plugin-copy.test.ts` checks the sentence overlap, the dashes, `seo.title`, the
install commands and the counts of skills, rules and agents for every plugin.

## Adding a plugin

Write `site/src/content/plugins/<name>.yaml` and register the plugin on the site as step 2 of
"Adding a new plugin" in [MAINTENANCE.md](MAINTENANCE.md) lists.

A plugin with no manifest, or a manifest with no plugin, fails the build with
`plugins collection and the catalog disagree`, and fails `site/scripts/catalog-coverage.test.ts`.
