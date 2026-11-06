# OpenCode plugin pages

Each standalone OpenCode plugin gets a page on toolkit.noppu.com at
`https://toolkit.noppu.com/opencode/<repo-name>`, listed on the hub at
`https://toolkit.noppu.com/opencode`. For example,
`https://toolkit.noppu.com/opencode/opencode-cache-manager`. The page comes from one file in
the plugin's own repo, `docs/toolkit-page.yaml`, and the images that file names. This
repo copies both at each npm release. [ADR-013](adr/013-opencode-plugin-pages-from-plugin-manifests.md)
explains why.

## What gets synced

`npm run sync:opencode -w site` reads the `latest` dist-tag of the plugin's npm package and
fetches the repo at the tag `v<version>`. That tag has to exist, and the `package.json` at
the tag has to name the same package and carry the same version. The page shows the version
and license from that `package.json`. A change to the manifest appears on the site after the
next release of the plugin, and after a maintainer merges the sync pull request.

## Fields

Every field is required unless the table says optional. Unknown keys are rejected. Text
fields are trimmed, except `requirements.config.code`, which keeps its whitespace. The limits
count characters, and a list's limit counts its items.

| Field | Limit |
| --- | --- |
| `schemaVersion` | The number `1` |
| `title` | 3 to 60 characters |
| `seo.title` | 10 to 60 characters |
| `seo.description` | 70 to 160 characters |
| `tagline` | 20 to 220 characters |
| `summary` | 20 to 200 characters |
| `chips` | 1 to 4 items of 1 to 24 characters |
| `image.src` | Image path, `.png`, `.jpg` or `.jpeg`, at least 1200 × 600 |
| `image.alt` | 10 to 250 characters |
| `install.hosts` | 1 to 3 hosts |
| `install.hosts[].label` | 1 to 24 characters, different for each host |
| `install.hosts[].commands` | 1 to 3 items of 1 to 200 characters |
| `install.hosts[].note` | Optional, 1 to 200 characters |
| `install.note` | Optional, 1 to 200 characters |
| `highlights.heading` | 3 to 80 characters |
| `highlights.items` | 3 to 6 items |
| `highlights.items[].label` | 1 to 16 characters |
| `highlights.items[].title` | 3 to 60 characters |
| `highlights.items[].body` | 10 to 260 characters |
| `howItWorks.heading` | 3 to 80 characters |
| `howItWorks.steps` | 2 to 6 items of 10 to 260 characters |
| `howItWorks.figure` | Optional |
| `howItWorks.figure.src` | Image path, `.png`, `.jpg`, `.jpeg` or `.svg` |
| `howItWorks.figure.alt` | 10 to 250 characters |
| `howItWorks.figure.caption` | Optional, 1 to 140 characters |
| `requirements.items` | 1 to 8 items of 3 to 200 characters |
| `requirements.config` | Optional |
| `requirements.config.path` | 1 to 120 characters |
| `requirements.config.language` | `json`, `jsonc` or `sh`. Reserved for syntax highlighting, which the page doesn't do |
| `requirements.config.code` | Not empty, at most 40 lines |
| `faq` | Optional, 0 to 8 entries |
| `faq[].q` | 5 to 120 characters |
| `faq[].a` | 10 to 400 characters |
| `links` | Optional, 0 to 8 entries |
| `links[].label` | 1 to 40 characters |
| `links[].href` | A URL that starts with `https://` |

## Text

Text is literal. The only formatting is inline code between backticks, so `cacheProfiles`
renders as code, and only in these fields:

- `tagline` and `summary`
- `install.note` and `install.hosts[].note`
- `highlights.heading`, `highlights.items[].title` and `highlights.items[].body`
- `howItWorks.heading`, `howItWorks.steps` and `howItWorks.figure.caption`
- `requirements.items`
- `faq[].q` and `faq[].a`

Every other field shows backticks as typed. HTML, Markdown links, emphasis and any other
markup show up as typed everywhere. An unmatched backtick shows as a backtick.

## Images

Image paths are relative to `docs/`, the folder that holds the manifest, so
`images/social-preview.png` means `docs/images/social-preview.png`. A path can contain `..`
only if it stays inside `docs/`. It can't start with `/`, contain a backslash, or have a
segment that falls outside `A-Z a-z 0-9 . _ -` or starts with a dot or hyphen. Each file is
at most 1 MiB.

`image.src` is the page's hero image and its social preview. It takes `.png`, `.jpg` or
`.jpeg`, and the sync rejects anything under 1200 × 600. Use a 2:1 image, such as
1200 × 600, because the social image is cropped to 1200 × 600 and any other ratio loses
its edges.

`howItWorks.figure.src` also takes `.svg`. The sync rejects an SVG that has any of these:

- a `<script>` element, or an event-handler attribute such as `onload`
- a `javascript:` URL, also with a tab or line break inside it
- a `<foreignObject>` element
- an internal DTD subset or an entity declaration
- UTF-16, bytes that aren't valid UTF-8, or an XML declaration naming another encoding
- a control character other than tab, line feed and carriage return

Element names match with any namespace prefix, such as `<svg:script>`. The first three checks
run after character references are decoded, so `&#106;avascript:` counts as `javascript:`.

## Example

Abridged from the Cache Manager's manifest. The comments mark where a real manifest has more
entries to meet the minimums above.

```yaml
schemaVersion: 1
title: OpenCode Cache Manager
seo:
  title: 'OpenCode Cache Manager: prompt cache TTL and keepalive'
  description: >-
    An OpenCode plugin for Claude and GPT-5.6+ prompt caching: pick a 5m, 1h or hybrid TTL per
    session, and keep idle caches warm with pings.
tagline: >-
  Take control of your prompt cache. Pick a 5m, 1h or hybrid TTL per session, and keep idle
  caches warm with pings so they don't expire while you're away.
summary: >-
  Pick a 5m, 1h or hybrid prompt-cache TTL per session, and keep idle caches warm with keepalive
  pings. Tuned for Claude and GPT-5.6+.
chips:
  - OpenCode V2
  - keepalive pings
image:
  src: images/social-preview.png
  alt: >-
    Cache Manager, an OpenCode plugin: after 15 minutes away, the default 5m cache has expired.
    With keepalive, pings keep it warm.
install:
  hosts:
    - label: OpenCode V2
      commands:
        - opencode plugin add @noppu-labs/opencode-cache-manager
  note: Also published unscoped as `opencode-cache-manager`.
highlights:
  heading: Stop paying to rewrite the cache.
  items:
    - label: ttl
      title: A TTL per session
      body: >-
        Switch any session to `5m`, `1h` or `hybrid` with `/cache-manager`.
    # two to five more items
howItWorks:
  heading: What happens to each request.
  steps:
    - >-
      OpenCode builds the request. On Claude it marks its own cache breakpoints.
    # one to five more steps
  figure:
    src: images/sidebar.svg
    alt: >-
      The Cache section of the OpenCode sidebar: status warm, 92% cached, expires 14:52.
    caption: The sidebar's Cache section during an idle stretch.
requirements:
  items:
    - OpenCode V2 2.0.22 or later
  config:
    path: ~/.config/opencode/opencode.jsonc
    language: jsonc
    code: |
      {
        "plugins": [{ "package": "@noppu-labs/opencode-cache-manager" }]
      }
faq:
  - q: Do keepalive pings cost money?
    a: >-
      Yes. Each ping is a real request that reads the whole context from cache.
links:
  - label: Supported providers
    href: https://github.com/noppu-labs/opencode-cache-manager/blob/main/docs/SUPPORTED_PROVIDERS.md
```

## Adding a plugin

1. Publish the plugin to npm, and tag each release `v<version>` in its repo. Name the repo
   after the plugin: the page's URL and the lock key are the repo name, in lowercase letters,
   digits and single hyphens.
2. Put `docs/toolkit-page.yaml` and its images in the plugin repo, and release them.
3. Add an entry to `site/opencode-lock.json` with only the repo and the package:

   ```json
   "opencode-example": {
     "repo": "noppu-labs/opencode-example",
     "package": "@noppu-labs/opencode-example"
   }
   ```

4. Run `npm run sync:opencode -w site`. It fills in the rest of the entry and copies the
   files. Commit both.
5. Update the copy that counts or names the plugins, since the sync doesn't touch it: the
   hub's lede in `site/src/components/opencode/HubHero.tsx`, the hub's meta description
   (`OPENCODE_HUB_HEAD` in `site/src/lib/pages.ts`) and the home page's OpenCode section in
   `site/src/components/sections/OpenCodeSection.tsx`.

The sync stops with an error that names the plugin and the field when something is wrong,
and it writes nothing for that plugin.

## Removing a plugin

Delete the plugin's entry from `site/opencode-lock.json` and its folder under
`site/src/content/opencode/`. The sync only writes the plugins the lock lists, so it never
deletes a folder whose entry is gone. Until the folder is deleted, `--check` and the site
build fail. Then update the same three places as in step 5 of adding one.

## Previewing an unreleased manifest

`--ref <name>=<ref>` syncs one plugin from a tag, branch or commit instead of its npm
release:

```sh
npm run sync:opencode -w site -- --ref opencode-cache-manager=docs/toolkit-page
```

The lock entry then records the ref. Run `npm run dev -w site` to see the page. The sync
only checks that the tag matches `package.json` when it follows npm, so a branch can carry
any version. CI fails while an entry is pinned to a ref, so put it back with a plain
`npm run sync:opencode -w site` before opening the pull request.

`npm run sync:opencode -w site -- --check` runs offline. It lists every copy that differs
from the lock and every entry that isn't on its release tag.
