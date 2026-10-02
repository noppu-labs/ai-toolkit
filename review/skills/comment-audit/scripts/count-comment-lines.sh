#!/usr/bin/env bash
# Usage: count-comment-lines.sh BASE HEAD [DIR...]
# Prints the number of comment lines added between BASE and HEAD (three-dot diff),
# limited to DIR paths when given. Recognises //, #, *, /*, /**, """, {/* and <!--.
# Python files are counted by python-comment-lines.py instead, which knows every
# line of a docstring and skips tool directives. Without python3, or for a file
# that does not parse, Python is counted by the same regex as everything else.
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "usage: $0 BASE HEAD [DIR...]" >&2
  exit 2
fi

base=$1
head=$2
shift 2

for ref in "$base" "$head"; do
  if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
    echo "count-comment-lines.sh: $ref is not a commit in this clone" >&2
    exit 2
  fi
done

helper="$(dirname "${BASH_SOURCE[0]}")/python-comment-lines.py"
python=${REVIEW_PYTHON:-python3}
comment='^\+[[:space:]]*(//|#[^[]|#$|\*|/\*|"""|\{/\*|<!--)'

count_by_regex() {
  git diff "${base}...${head}" -- "$@" | grep -cE "$comment" || true
}

# Added lines of one Python file whose head-side number the helper reported.
count_python() {
  local path=$1 old=$2 lines

  if ! lines=$("$python" "$helper" "$head" "$path" 2>/dev/null); then
    echo "count-comment-lines.sh: $path does not parse as Python at $head; counted by the regex" >&2
    count_by_regex ${old:+":(top)$old"} ":(top)$path"
    return
  fi

  git diff -U0 "${base}...${head}" -- ${old:+":(top)$old"} ":(top)$path" \
    | awk -v keep="$(printf '%s ' $lines)" '
        BEGIN { n = split(keep, k, " "); for (i = 1; i <= n; i++) comment[k[i]] = 1 }
        /^diff --git / { line = 0; next }
        /^@@ / { split($3, h, ","); line = substr(h[1], 2) + 0; next }
        line && /^\+/ { if (line in comment) count++; line++ }
        END { print count + 0 }
      '
}

if ! command -v "$python" >/dev/null 2>&1; then
  echo "count-comment-lines.sh: $python not found; Python files are counted by the regex" >&2
  count_by_regex "$@"
  exit 0
fi

total=$(count_by_regex "$@" ':(top,exclude)*.py')

while IFS= read -r -d '' status; do
  old=""

  case $status in
    R* | C*) IFS= read -r -d '' old ;;
  esac

  IFS= read -r -d '' path

  if [[ $path == *.py && $status != D ]]; then
    total=$((total + $(count_python "$path" "$old")))
  fi
done < <(git diff --name-status -z "${base}...${head}" -- "$@")

echo "$total"
