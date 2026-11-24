#!/usr/bin/env bash
# Prints the release notes for one plugin or shared package: one line per
# change to <dir> on main's first-parent history since <prev-tag> (all history
# when it is empty). The release job in .github/workflows/release.yml calls it
# from the repository root.
#
# Usage: release-notes.sh <dir> [<prev-tag>]
#
# A commit whose only change in <dir> is to .claude-plugin/plugin.json, and only
# to its metadata fields (METADATA_FIELDS), is left out: that is a catalog-wide
# edit made by another PR, not a change to the plugin. A GitHub merge commit
# ("Merge pull request #N from <branch>") is listed under the PR title GitHub
# puts in its body, so each merged PR is one line whatever its merge method.
set -euo pipefail

dir="${1:?usage: release-notes.sh <dir> [<prev-tag>]}"
dir="${dir#./}"
dir="${dir%/}"
prev="${2:-}"
manifest="$dir/.claude-plugin/plugin.json"

command -v node >/dev/null || {
  echo "release-notes.sh: node is required" >&2
  exit 1
}

range=HEAD
if [[ -n "$prev" ]]; then
  range="$prev..HEAD"
fi

# Prints "same" when both manifests parse and differ only in metadata fields.
# A manifest that is missing or does not parse never counts as metadata-only.
same_but_metadata() {
  node -e '
    const METADATA_FIELDS = ["author", "description", "displayName", "homepage", "keywords", "license", "repository"];
    const canonical = (value) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
        : Array.isArray(value) ? value.map(canonical) : value;
    const strip = (text) => {
      const value = JSON.parse(text);
      for (const field of METADATA_FIELDS) delete value[field];
      return JSON.stringify(canonical(value));
    };
    try {
      if (strip(process.argv[1]) === strip(process.argv[2])) process.stdout.write("same");
    } catch {}
  ' "$1" "$2"
}

metadata_only() {
  local sha="$1" files before after

  if ! git rev-parse -q --verify "$sha^1" >/dev/null; then
    return 1
  fi

  files=$(git diff --name-only "$sha^1" "$sha" -- "$dir/")
  if [[ "$files" != "$manifest" ]]; then
    return 1
  fi

  before=$(git show "$sha^1:$manifest" 2>/dev/null) || return 1
  after=$(git show "$sha:$manifest" 2>/dev/null) || return 1
  [[ "$(same_but_metadata "$before" "$after")" == same ]]
}

describe() {
  local sha="$1" subject short body title number

  subject=$(git log -1 --format=%s "$sha")
  short=$(git log -1 --format=%h "$sha")
  if [[ "$subject" =~ ^Merge\ pull\ request\ \#([0-9]+)\ from\  ]]; then
    number="${BASH_REMATCH[1]}"
    body=$(git log -1 --format=%b "$sha")
    title=$(sed -n '/[^[:space:]]/{p;q;}' <<<"$body")
    if [[ -n "$title" && "$title" == *"(#$number)" ]]; then
      subject="$title"
    elif [[ -n "$title" ]]; then
      subject="$title (#$number)"
    fi
  fi

  printf -- '- %s (%s)\n' "$subject" "$short"
}

# Captured first, so set -e stops the script when git log fails.
shas=$(git log --first-parent --format=%H "$range" -- "$dir/")

printed=0
while read -r sha; do
  if [[ -z "$sha" ]] || metadata_only "$sha"; then
    continue
  fi

  describe "$sha"
  printed=1
done <<<"$shas"

if [[ "$printed" -eq 0 ]]; then
  echo "- Maintenance release"
fi
