#!/usr/bin/env bash
# Usage: verify-comments-only.sh FROM TO [DIR...]
# Prints every changed line between FROM and TO (two-dot diff) that is not a comment,
# a comment terminator, or blank. Markdown files are excluded because README sections
# are an expected part of a comment trim. Exit 1 when any line is printed.
# Python files are checked against python-comment-lines.py on each side, so every
# line of a docstring counts as a comment and a changed tool directive is a hit.
# Without python3, or for a file that does not parse, Python uses the regex filter.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -r "$lib" ] || { echo "verify-comments-only.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs verify-comments-only.sh 'FROM TO' "$@"
from=$1
to=$2
shift 2

filter_by_regex() {
  grep -E '^[-+]' \
    | grep -vE '^(\+\+\+|---) ' \
    | grep -vE '^[-+][[:space:]]*(//|#[^[]|#$|\*|/\*|"""|\{/\*|<!--|-->|$)' \
    || true
}

# Changed lines of one Python file that are not blank and not a comment line on
# their own side: FROM for a removed line, TO for an added one.
# A file that parses at FROM and not at TO was broken by the change, so that is
# a hit. One that already failed at FROM falls back to the regex filter.
python_hits() {
  local status=$1 path=$2 old=$3 before="" after=""

  if [[ $status != A ]] && ! before=$("$python" "$helper" "$from" "${old:-$path}" 2>/dev/null); then
    echo "verify-comments-only.sh: $path does not parse as Python; checked with the regex" >&2
    git diff "$from" "$to" -- ${old:+":(top)$old"} ":(top)$path" | filter_by_regex
    return
  fi

  if [[ $status != D ]] && ! after=$("$python" "$helper" "$to" "$path" 2>/dev/null); then
    echo "$path: does not parse as Python at $to"
    return
  fi

  git diff "$from" "$to" -- ${old:+":(top)$old"} ":(top)$path" \
    | mark_listed_lines "$before" "$after" \
    | awk '/^0/ && !/^0[-+][[:space:]]*$/ { print substr($0, 2) }'
}

if command -v "$python" >/dev/null 2>&1; then
  collect_mixed_renames < <(git diff --name-status -z "$from" "$to" -- "$@")
  hits=$(git diff "$from" "$to" -- "$@" ':(top,exclude)*.md' ':(top,exclude)*.py' \
    ${mixed_excludes[@]+"${mixed_excludes[@]}"} | filter_by_regex)

  # A .py file renamed to another extension is checked with the regex, paired.
  # One renamed to markdown is skipped, as markdown always is.
  for ((i = 0; i < ${#mixed[@]}; i += 2)); do
    if [[ ${mixed[i + 1]} != *.py && ${mixed[i + 1]} != *.md ]]; then
      hits+=$'\n'$(git diff "$from" "$to" -- ":(top)${mixed[i]}" ":(top)${mixed[i + 1]}" | filter_by_regex)
    fi
  done

  while read_change; do
    if [[ $path == *.py ]]; then
      hits+=$'\n'$(python_hits "${status:0:1}" "$path" "$old")
    fi
  done < <(git diff --name-status -z "$from" "$to" -- "$@")

  hits=$(printf '%s\n' "$hits" | sed '/^$/d')
else
  echo "verify-comments-only.sh: $python not found; Python files are checked with the regex" >&2
  hits=$(git diff "$from" "$to" -- "$@" ':(top,exclude)*.md' | filter_by_regex)
fi

if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  exit 1
fi

echo "only comment lines changed"
