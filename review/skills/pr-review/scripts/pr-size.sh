#!/usr/bin/env bash
# Usage: pr-size.sh BASE HEAD
# Prints `lines=<n> large=yes|no` for the BASE...HEAD diff of the whole repository:
# added plus deleted lines, leaving out lockfiles, binary files (numstat prints - for
# them, read as zero) and the unchanged part of a renamed file, so a file moved without
# edits counts zero. large is yes when lines is over LARGE_LINES.
set -euo pipefail

LARGE_LINES=2500

if [[ $# -ne 2 ]]; then
  echo "usage: $0 BASE HEAD" >&2
  exit 2
fi

for ref in "$1" "$2"; do
  if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
    echo "pr-size.sh: $ref is not a commit in this clone" >&2
    exit 2
  fi
done

cd "$(git rev-parse --show-toplevel)"

git diff --numstat -M --no-color --no-ext-diff --no-textconv "$1...$2" -- . \
  ':!*.lock' ':!*package-lock.json' ':!*npm-shrinkwrap.json' ':!*pnpm-lock.yaml' ':!*go.sum' |
  awk -v limit="$LARGE_LINES" '
    { n += $1 + $2 }
    END { printf "lines=%d large=%s\n", n, (n > limit ? "yes" : "no") }'
