# Setup shared by count-comment-lines.sh and verify-comments-only.sh, which source it.

helper="$(dirname "${BASH_SOURCE[0]}")/python-comment-lines.py"
python=${REVIEW_PYTHON:-python3}

# Usage: check_refs NAME 'BASE HEAD' "$@". Exits 2 with a usage line on fewer
# than two arguments, or naming NAME and the ref when either is not a commit.
check_refs() {
  local ref

  if [ "$#" -lt 4 ]; then
    echo "usage: $0 $2 [DIR...]" >&2
    exit 2
  fi

  for ref in "$3" "$4"; do
    if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
      echo "$1: $ref is not a commit in this clone" >&2
      exit 2
    fi
  done
}

# Reads one `git diff --name-status -z` entry from stdin into status, old (set
# only for a rename or copy), and path. Returns 1 at the end of input.
read_change() {
  old=""
  IFS= read -r -d '' status || return 1

  case $status in
    R* | C*) IFS= read -r -d '' old ;;
  esac

  IFS= read -r -d '' path
}

# Usage: mark_listed_lines BEFORE AFTER < diff. Prints each changed line prefixed
# with 1 when its number is in BEFORE (removed) or AFTER (added), else with 0.
mark_listed_lines() {
  awk -v before="$(printf '%s ' $1)" -v after="$(printf '%s ' $2)" '
    BEGIN { n = split(before, b, " "); for (i = 1; i <= n; i++) was[b[i]] = 1
            n = split(after, a, " "); for (i = 1; i <= n; i++) now[a[i]] = 1 }
    /^diff --git / { hunk = 0; next }
    /^@@ / {
      split($2, o, ","); split($3, h, ","); hunk = 1
      left = substr(o[1], 2) + 0; right = substr(h[1], 2) + 0; next
    }
    !hunk { next }
    /^-/ { mark = (left in was) ? 1 : 0; print mark $0; left++; next }
    /^\+/ { mark = (right in now) ? 1 : 0; print mark $0; right++; next }
    /^ / { left++; right++ }
  '
}
