#!/usr/bin/env bash
# Usage: count-comment-lines.sh BASE HEAD [DIR...]
# Prints the number of comment lines added between BASE and HEAD (three-dot diff),
# limited to DIR paths when given. Recognises //, #, *, /*, /**, """, {/* and <!--.
# Python files are counted by python-comment-lines.py instead, which knows every
# line of a docstring and skips tool directives. Without python3, or for a file
# that does not parse, Python is counted by the same regex as everything else.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -r "$lib" ] || { echo "count-comment-lines.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs count-comment-lines.sh 'BASE HEAD' "$@"
base=$1
head=$2
shift 2

comment='^\+[[:space:]]*(//|#[^[]|#$|\*|/\*|"""|\{/\*|<!--)'

count_by_regex() {
  git diff --no-relative "${base}...${head}" -- "$@" | grep -cE "$comment" || true
}

# Added lines of one Python file whose head-side number the helper reported.
count_python() {
  local path=$1 old=$2 lines error

  if ! lines=$("$python" "$helper" "$head" "$path" 2>/dev/null); then
    error=$("$python" "$helper" "$head" "$path" 2>&1 >/dev/null | head -n 1) || true
    echo "count-comment-lines.sh: ${error:-$path does not parse as Python at $head}; counted by the regex" >&2
    count_by_regex ${old:+":(top,literal)$old"} ":(top,literal)$path"
    return
  fi

  git diff -U0 --no-relative "${base}...${head}" -- ${old:+":(top,literal)$old"} ":(top,literal)$path" \
    | mark_listed_lines "" "$lines" \
    | awk '/^1\+/ { count++ } END { print count + 0 }'
}

if ! command -v "$python" >/dev/null 2>&1; then
  echo "count-comment-lines.sh: $python not found; Python files are counted by the regex" >&2
  count_by_regex "$@"
  exit 0
fi

collect_mixed_renames < <(git diff --no-relative --name-status -z "${base}...${head}" -- "$@")
total=$(count_by_regex "$@" ':(top,exclude)*.py' ${mixed_excludes[@]+"${mixed_excludes[@]}"})

# A .py file renamed to another extension is counted by the regex, paired.
for ((i = 0; i < ${#mixed[@]}; i += 2)); do
  if [[ ${mixed[i + 1]} != *.py ]]; then
    total=$((total + $(count_by_regex ":(top,literal)${mixed[i]}" ":(top,literal)${mixed[i + 1]}")))
  fi
done

while read_change; do
  if [[ $path == *.py && $status != D ]]; then
    total=$((total + $(count_python "$path" "$old")))
  fi
done < <(git diff --no-relative --name-status -z "${base}...${head}" -- "$@")

echo "$total"
