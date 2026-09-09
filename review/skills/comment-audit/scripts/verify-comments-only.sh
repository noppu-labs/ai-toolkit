#!/usr/bin/env bash
# Usage: verify-comments-only.sh FROM TO [DIR...]
# Prints every changed line between FROM and TO (two-dot diff) that is not a comment,
# a comment terminator, or blank. Markdown files are excluded because README sections
# are an expected part of a comment trim. Exit 1 when any line is printed.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 FROM TO [DIR...]" >&2
  exit 2
fi

from=$1
to=$2
shift 2

hits=$(
  git diff "$from" "$to" -- "$@" ':(exclude)*.md' \
    | grep -E '^[-+]' \
    | grep -vE '^(\+\+\+|---) ' \
    | grep -vE '^[-+][[:space:]]*(//|#[^[]|#$|\*|/\*|"""|\{/\*|<!--|-->|$)' \
    || true
)

if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  exit 1
fi

echo "only comment lines changed"
