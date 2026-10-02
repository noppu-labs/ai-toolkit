#!/usr/bin/env bash
# Usage: verify-comments-only.sh FROM TO [DIR...]
# Prints every changed line between FROM and TO (two-dot diff) that is not a comment,
# a comment terminator, or blank. Markdown files are excluded because README sections
# are an expected part of a comment trim. Exit 1 when any line is printed.
# Python files are checked against python-comment-lines.py on each side, so every
# line of a docstring counts as a comment and a changed tool directive is a hit.
# Without python3, or for a file that does not parse, Python uses the regex filter.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 FROM TO [DIR...]" >&2
  exit 2
fi

from=$1
to=$2
shift 2

for ref in "$from" "$to"; do
  if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
    echo "verify-comments-only.sh: $ref is not a commit in this clone" >&2
    exit 2
  fi
done

helper="$(dirname "${BASH_SOURCE[0]}")/python-comment-lines.py"
python=${REVIEW_PYTHON:-python3}

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
    | awk -v before="$(printf '%s ' $before)" -v after="$(printf '%s ' $after)" '
        BEGIN {
          n = split(before, b, " "); for (i = 1; i <= n; i++) was[b[i]] = 1
          n = split(after, a, " "); for (i = 1; i <= n; i++) now[a[i]] = 1
        }
        /^diff --git / { hunk = 0; next }
        /^@@ / {
          split($2, o, ","); split($3, h, ",")
          left = substr(o[1], 2) + 0; right = substr(h[1], 2) + 0; hunk = 1
          next
        }
        !hunk { next }
        /^-/ { if (!(left in was) && $0 !~ /^-[[:space:]]*$/) print; left++; next }
        /^\+/ { if (!(right in now) && $0 !~ /^\+[[:space:]]*$/) print; right++; next }
        /^ / { left++; right++ }
      '
}

if command -v "$python" >/dev/null 2>&1; then
  hits=$(git diff "$from" "$to" -- "$@" ':(top,exclude)*.md' ':(top,exclude)*.py' | filter_by_regex)

  while IFS= read -r -d '' status; do
    old=""

    case $status in
      R* | C*) IFS= read -r -d '' old ;;
    esac

    IFS= read -r -d '' path

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
