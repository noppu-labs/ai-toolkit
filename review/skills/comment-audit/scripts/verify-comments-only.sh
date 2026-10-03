#!/usr/bin/env bash
# Usage: verify-comments-only.sh FROM TO [DIR...]
# Prints every changed line between FROM and TO (two-dot diff) that is not a comment,
# a comment terminator, or blank. Markdown files are excluded because README sections
# are an expected part of a comment trim. Exit 1 when any line is printed.
# Python files are checked against python-comment-lines.py, run once per side
# over every Python file, so every docstring line but a doctest counts as a
# comment and a changed tool directive is a hit. Without python3, or for a file
# that already does not parse at FROM, Python uses the regex filter.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[ -r "$lib" ] || { echo "verify-comments-only.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs verify-comments-only.sh 'FROM TO' "$@"
from=$1
to=$2
shift 2

read_changes < <(git_diff --name-status -z "$from" "$to" -- "$@")

# Every Python file on each side: at FROM under its old name, at TO under its
# new one. A file that parses at FROM and not at TO was broken by the change,
# so route_diff reports that as a hit; one that already fails at FROM falls
# back to the regex.
from_paths=()
to_paths=()
for ((i = 0; i < ${#paths[@]}; i++)); do
  if [[ ${paths[i]} == *.py ]]; then
    if [[ ${statuses[i]} != A ]]; then
      from_paths+=("${olds[i]:-${paths[i]}}")
    fi
    if [[ ${statuses[i]} != D ]]; then
      to_paths+=("${paths[i]}")
    fi
  fi
done

have_python=1
from_rc=0
from_out=""
to_rc=0
to_out=""
if ! command -v "$python" >/dev/null 2>&1; then
  echo "verify-comments-only.sh: $python not found; Python files are checked with the regex" >&2
  have_python=0
else
  if [ "${#from_paths[@]}" -gt 0 ]; then
    from_out=$(printf '%s\0' "${from_paths[@]}" | "$python" "$helper" "$from" 2>&1) || from_rc=$?
  fi
  if [ "${#to_paths[@]}" -gt 0 ]; then
    to_out=$(printf '%s\0' "${to_paths[@]}" | "$python" "$helper" "$to" 2>&1) || to_rc=$?
  fi
fi

hits=$({
  for ((i = 0; i < ${#paths[@]}; i++)); do
    printf '%s\t%s\t%s\n' "${statuses[i]}" "${olds[i]}" "${paths[i]}"
  done
  if [ "$have_python" = 1 ]; then
    printf '== from %s\n' "$from_rc"
    [ -z "$from_out" ] || printf '%s\n' "$from_out"
    printf '== to %s\n' "$to_rc"
    [ -z "$to_out" ] || printf '%s\n' "$to_out"
  fi
  printf '== diff\n'
  git_diff -U0 "$from" "$to" -- "$@"
} | route_diff verify "$from" "$to")

if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  exit 1
fi

echo "only comment lines changed"
