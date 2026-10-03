#!/usr/bin/env bash
# Usage: count-comment-lines.sh BASE HEAD [DIR...]
# Prints the number of comment lines added between BASE and HEAD (three-dot diff),
# limited to DIR paths when given. Recognises //, #, *, /*, /**, """, {/* and <!--.
# Python files are counted by python-comment-lines.py instead, which knows every
# line of a docstring and skips tool directives; it reads every Python file at
# HEAD in one call. Without python3, or for a file that does not parse, Python
# is counted by the same regex as everything else.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -r "$lib" ] || { echo "count-comment-lines.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs count-comment-lines.sh 'BASE HEAD' "$@"
base=$1
head=$2
shift 2

read_changes < <(git_diff --name-status -z "${base}...${head}" -- "$@")

# Every Python file present at HEAD.
to_paths=()
for ((i = 0; i < ${#paths[@]}; i++)); do
  if [[ ${statuses[i]} != D && ${paths[i]} == *.py ]]; then
    to_paths+=("${paths[i]}")
  fi
done

have_python=1
to_rc=0
to_out=""
if ! command -v "$python" >/dev/null 2>&1; then
  echo "count-comment-lines.sh: $python not found; Python files are counted by the regex" >&2
  have_python=0
elif [ "${#to_paths[@]}" -gt 0 ]; then
  to_out=$(printf '%s\0' "${to_paths[@]}" | "$python" "$helper" "$head" 2>&1) || to_rc=$?
fi

{
  for ((i = 0; i < ${#paths[@]}; i++)); do
    printf '%s\t%s\t%s\n' "${statuses[i]}" "${olds[i]}" "${paths[i]}"
  done
  if [ "$have_python" = 1 ]; then
    printf '== to %s\n' "$to_rc"
    [ -z "$to_out" ] || printf '%s\n' "$to_out"
  fi
  printf '== diff\n'
  git_diff -U0 "${base}...${head}" -- "$@"
} | route_diff count "$base" "$head"
