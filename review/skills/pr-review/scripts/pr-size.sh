#!/usr/bin/env bash
# Usage: pr-size.sh BASE HEAD
# Prints `lines=<n> code-review=high|xhigh|max correctness-review=1|3|4` for the
# BASE...HEAD diff of the whole repository. lines is added plus deleted lines, leaving
# out lockfiles, binary files (numstat prints - for them, read as zero) and the
# unchanged part of a renamed file, so a file moved without edits counts zero.
# code-review is the level for Claude Code's code-review skill. correctness-review is
# how many subagents share the correctness-review angles.
set -euo pipefail

HIGH_UP_TO=300
XHIGH_UP_TO=3000
ONE_AGENT_UP_TO=200
THREE_AGENTS_UP_TO=1200

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
  awk -v high="$HIGH_UP_TO" -v xhigh="$XHIGH_UP_TO" \
    -v one="$ONE_AGENT_UP_TO" -v three="$THREE_AGENTS_UP_TO" '
    { n += $1 + $2 }
    END {
      level = n > xhigh ? "max" : n > high ? "xhigh" : "high"
      agents = n > three ? 4 : n > one ? 3 : 1
      printf "lines=%d code-review=%s correctness-review=%d\n", n, level, agents
    }'
