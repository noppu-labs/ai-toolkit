#!/usr/bin/env bash
# Prints the release notes for one plugin or shared package: one line per
# commit that changed <dir> since <prev-tag> (all history when it is empty).
# The release job in .github/workflows/release.yml calls it.
#
# Usage: release-notes.sh <dir> [<prev-tag>]
#
# A commit whose only change in <dir> is to .claude-plugin/plugin.json, and
# leaves its version alone, is left out: that is a catalog-wide metadata edit
# (homepage, description) made by another PR, not a change to the plugin.
# A GitHub merge commit ("Merge pull request #N from <branch>") is listed under
# the PR title GitHub puts in its body.
set -euo pipefail

dir="${1:?usage: release-notes.sh <dir> [<prev-tag>]}"
prev="${2:-}"
manifest="$dir/.claude-plugin/plugin.json"

range=HEAD
if [[ -n "$prev" ]]; then
  range="$prev..HEAD"
fi

manifest_version() {
  git show "$1:$manifest" 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).version??""))}catch{}})'
}

metadata_only() {
  local sha="$1" files

  if ! git rev-parse -q --verify "$sha^1" >/dev/null; then
    return 1
  fi

  files=$(git diff --name-only "$sha^1" "$sha" -- "$dir/")
  if [[ "$files" != "$manifest" ]]; then
    return 1
  fi

  [[ "$(manifest_version "$sha^1")" == "$(manifest_version "$sha")" ]]
}

describe() {
  local sha="$1" subject short title number

  subject=$(git log -1 --format=%s "$sha")
  short=$(git log -1 --format=%h "$sha")
  if [[ "$subject" =~ ^Merge\ pull\ request\ \#([0-9]+)\ from\  ]]; then
    number="${BASH_REMATCH[1]}"
    title=$(git log -1 --format=%b "$sha" | sed -n '/[^[:space:]]/{p;q;}')
    if [[ -n "$title" && "$title" == *"(#$number)" ]]; then
      subject="$title"
    elif [[ -n "$title" ]]; then
      subject="$title (#$number)"
    fi
  fi

  printf -- '- %s (%s)\n' "$subject" "$short"
}

printed=0
while read -r sha; do
  if metadata_only "$sha"; then
    continue
  fi

  describe "$sha"
  printed=1
done < <(git log --format=%H "$range" -- "$dir/")

if [[ "$printed" -eq 0 ]]; then
  echo "- Maintenance release"
fi
