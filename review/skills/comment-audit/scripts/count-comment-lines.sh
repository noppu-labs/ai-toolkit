#!/usr/bin/env bash
# Usage: count-comment-lines.sh BASE HEAD [DIR...]
# Prints the number of comment lines added between BASE and HEAD (three-dot diff),
# limited to DIR paths when given. Recognises //, #, *, /*, /**, """, {/* and <!--.
# Python files are counted by python-comment-lines.py instead, which knows every
# line of a docstring and skips tool directives; it reads every changed Python
# file at HEAD in one call. Without python3, or for a file that does not parse,
# Python is counted by the same regex as everything else.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -r "$lib" ] || { echo "count-comment-lines.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs count-comment-lines.sh 'BASE HEAD' "$@"
base=$1
head=$2
shift 2

read_changes < <(git_diff --name-status -z "${base}...${head}" -- "$@")

# Every changed Python file present at HEAD.
to_paths=()
for ((i = 0; i < ${#paths[@]}; i++)); do
  if [[ ${statuses[i]} != D && ${paths[i]} == *.py ]]; then
    to_paths+=("${paths[i]}")
  fi
done

sides=to
to_out=""
if ! command -v "$python" >/dev/null 2>&1; then
  echo "count-comment-lines.sh: $python not found; Python files are counted by the regex" >&2
  sides=""
elif [ "${#to_paths[@]}" -gt 0 ]; then
  to_out=$(printf '%s\0' "${to_paths[@]}" | "$python" "$helper" "$head" 2>&1) || true
fi

emit_stream "$sides" "${base}...${head}" -- "$@" | route_diff count "$base" "$head"
