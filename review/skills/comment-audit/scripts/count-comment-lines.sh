#!/usr/bin/env bash
# Usage: count-comment-lines.sh BASE HEAD [DIR...]
# Prints the number of comment lines added between BASE and HEAD (three-dot diff),
# limited to DIR paths when given. Recognises //, #, *, /*, /**, """, {/* and <!--.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 BASE HEAD [DIR...]" >&2
  exit 2
fi

base=$1
head=$2
shift 2

git diff "${base}...${head}" -- "$@" \
  | grep -cE '^\+[[:space:]]*(//|#|\*|/\*|"""|\{/\*|<!--)' \
  || true
