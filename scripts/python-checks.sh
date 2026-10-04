#!/usr/bin/env bash
# Every Python check CI runs (the `python` job in .github/workflows/quality.yml), in the same
# order, so `npm run lint:python` and CI cannot drift. Tool settings live in pyproject.toml.
# Needs uv (https://docs.astral.sh/uv/) and a prior `uv sync --frozen`.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v uv >/dev/null 2>&1; then
  echo "python-checks.sh: uv is not installed; see https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 127
fi

scripts=review/skills/comment-audit/scripts

run() {
  echo "== $*"
  "$@"
}

run uv run --frozen ruff check
run uv run --frozen ruff format --check
run uv run --frozen pyright
run uv run --frozen codespell "$scripts"
run uv run --frozen bandit -c pyproject.toml -q -r "$scripts"
run uv run --frozen complexipy "$scripts"
