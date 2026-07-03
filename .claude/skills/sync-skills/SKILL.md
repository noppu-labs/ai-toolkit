---
name: sync-skills
description: Use when checking vendored skills for upstream updates, pulling or merging upstream changes into this repo, or re-baselining skills-lock.json after editing a vendored skill.
---

# Sync vendored skills with upstream

Prerequisites: `gh` CLI authenticated. Run everything from the repo root.

## Workflow

1. Run `npm run sync -- status`. States and what to do:
   - `up-to-date` — nothing to do.
   - `local` — our own skill, no upstream; nothing to sync.
   - `upstream-updated` — safe fast-forward: `npm run sync -- pull <plugin>/<skill>`.
   - `locally-modified` — we edited since the last baseline. If the edits are intentional,
     `npm run sync -- accept <plugin>/<skill>`.
   - `diverged` — both sides changed: merge manually (section below).
   - `fetch-error (...)` — upstream unreachable or moved; check `source`/`skillPath` in the
     plugin's `skills-lock.json` against the upstream repo.

2. After all changes: `npm run sync -- verify`, then commit with a message that
   lists which skills were pulled or merged and from which upstream commits.

## Manual merge for diverged skills

Never blind-overwrite a diverged skill — `pull --force` discards our customizations.

1. `npm run sync -- diff <plugin>/<skill>` — full diff, vendored → upstream.
2. Identify which differences are OUR deliberate customizations
   (`git log -p -- <plugin>/skills/<skill>` shows how the vendored copy evolved)
   versus genuine upstream improvements.
3. Edit the vendored files to incorporate the upstream improvements while preserving every
   local customization. Read both versions fully before editing.
4. Re-baseline BOTH sides: `npm run sync -- seed <plugin>/<skill>`
   (`accept` only re-baselines the vendored hash and would leave the skill permanently
   flagged as upstream-updated).
