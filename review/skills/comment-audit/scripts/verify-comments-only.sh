#!/usr/bin/env bash
# Usage: verify-comments-only.sh FROM TO [DIR...]
# Prints every changed line between FROM and TO (two-dot diff) that is not a comment,
# a comment terminator, or blank. Markdown files are excluded because README sections
# are an expected part of a comment trim. Exit 1 when any line is printed.
# Python files are checked against python-comment-lines.py, run once per side
# over every changed Python file, so every docstring line but a doctest counts
# as a comment and a changed tool directive is a hit. Without python3, or for a
# file that already does not parse at FROM, Python uses the regex filter.
set -euo pipefail

lib="$(dirname "${BASH_SOURCE[0]}")/lib.sh"
[[ -r "$lib" ]] || { echo "verify-comments-only.sh: cannot read $lib" >&2; exit 2; }
source "$lib"

check_refs verify-comments-only.sh 'FROM TO' "$@"
from=$1
to=$2
shift 2

read_changes < <(git_diff --name-status -z "$from" "$to" -- "$@")

# Every changed Python file on each side: at FROM under its old name, at TO
# under its new one.
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

sides="from to"
from_out=""
to_out=""
if ! command -v "$python" >/dev/null 2>&1; then
  echo "verify-comments-only.sh: $python not found; Python files are checked with the regex" >&2
  sides=""
else
  if [[ "${#from_paths[@]}" -gt 0 ]]; then
    from_out=$(printf '%s\0' "${from_paths[@]}" | "$python" "$helper" "$from" 2>&1) || true
  fi
  if [[ "${#to_paths[@]}" -gt 0 ]]; then
    to_out=$(printf '%s\0' "${to_paths[@]}" | "$python" "$helper" "$to" 2>&1) || true
  fi
fi

hits=$(emit_stream "$sides" "$from" "$to" -- "$@" | route_diff verify "$from" "$to")

if [[ -n "$hits" ]]; then
  printf '%s\n' "$hits"
  exit 1
fi

echo "only comment lines changed"
