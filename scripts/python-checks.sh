#!/usr/bin/env bash
# CI's `python` job (.github/workflows/quality.yml) runs this script: add a Python check here,
# not to the workflow.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v uv >/dev/null 2>&1; then
  echo "python-checks.sh: uv is not installed; see https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 127
fi

scripts=review/skills/comment-audit/scripts
status=0

run() {
  echo "== $*"
  "$@"
}

run uv run --frozen ruff check || status=1
run uv run --frozen ruff format --check || status=1
run uv run --frozen pyright || status=1
run uv run --frozen codespell "$scripts" || status=1
run uv run --frozen bandit -c pyproject.toml -q -r "$scripts" || status=1
run uv run --frozen complexipy "$scripts" || status=1

exit "$status"
