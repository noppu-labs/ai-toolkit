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

# Usage: git_diff ARGS... Every diff both scripts read. -M pairs renames and
# never copies, whatever diff.renames says; --no-relative keeps paths relative
# to the top from any directory; the rest keep the `diff --git a/OLD b/NEW`
# header literal for route_diff under diff.noprefix, color, an external diff
# tool, and non-ASCII paths.
git_diff() {
  git -c core.quotePath=false diff -M --no-relative --no-color --no-ext-diff \
    --src-prefix=a/ --dst-prefix=b/ "$@"
}

# Reads one `git diff --name-status -z` entry from stdin into status, old (set
# only for a rename), and path. Returns 1 at the end of input.
read_change() {
  old=""
  IFS= read -r -d '' status || return 1

  case $status in
    R*) IFS= read -r -d '' old ;;
  esac

  IFS= read -r -d '' path
}

# Reads every `git diff --name-status -z` entry from stdin into the parallel
# arrays statuses, olds, and paths, leaving out an entry whose old or new path
# holds a newline or a tab: it would break the line and tab framing of
# route_diff's stream, so it is never sent to the helper and route_diff
# routes it to the regex.
read_changes() {
  statuses=()
  olds=()
  paths=()

  while read_change; do
    case $old$path in
      *$'\n'* | *$'\t'*) continue ;;
    esac
    statuses+=("$status")
    olds+=("$old")
    paths+=("$path")
  done
}

# Usage: route_diff MODE FROM TO < stream, MODE count or verify. The stream is
# one `STATUS<TAB>OLD<TAB>NEW` line per changed file; for each side the helper
# ran on, `== from RC` or `== to RC` followed by the helper's output; then
# `== diff` and a -U0 patch from git_diff. Each file section is routed by its
# header: a Python file the helper listed uses the listed line numbers, one it
# failed on is reported on stderr and uses the regex, and every other file uses
# the regex. count prints the number of added comment lines; verify prints
# every changed line that is not a comment or blank, markdown on both sides
# excluded, and `PATH: does not parse as Python at TO` for a file that parsed
# at FROM only.
route_diff() {
  awk -v mode="$1" -v from="$2" -v to="$3" '
    function ends(s, suffix) {
      return (substr(s, length(s) - length(suffix) + 1) == suffix)
    }
    # The paths a side was sent: every Python file present on that side.
    function open_side(side,   i) {
      for (i = 1; i <= n; i++) {
        if (!ends(news[i], ".py")) continue
        if (side == "from" && status[i] != "A") known[side, froms[i]] = 1
        if (side == "to" && status[i] != "D") known[side, news[i]] = 1
      }
    }
    # `PATH<TAB>N` lists line N of PATH; `PATH<TAB>MESSAGE` for a known PATH
    # fails it; anything else is the interpreter failing as a whole.
    function record(side, line,   p, pos, rest, i) {
      if (match(line, /\t[0-9]+$/)) {
        listed[side, substr(line, 1, RSTART - 1), substr(line, RSTART + 1) + 0] = 1
        return
      }
      rest = line
      pos = 0
      while ((i = index(rest, "\t")) > 0) {
        pos += i
        p = substr(line, 1, pos - 1)
        if ((side, p) in known) {
          failed[side, p] = substr(line, pos + 1)
          return
        }
        rest = substr(rest, i + 1)
      }
      if (!(side in crash)) crash[side] = line
    }
    # A non-zero exit that named no file, or printed a line that is not a
    # record, fails every file of the side.
    function close_side(side,   k, parts, named) {
      if (rc[side] == 0) return
      for (k in failed) {
        split(k, parts, SUBSEP)
        if (parts[1] == side) named = 1
      }
      if (named && !(side in crash)) return
      for (k in known) {
        split(k, parts, SUBSEP)
        if (parts[1] == side && !(k in failed)) failed[k] = crash[side]
      }
    }
    function reason(side, p,   m) {
      m = failed[side, p]
      if (m != "") return m
      return (mode == "count" ? p " does not parse as Python at " ref[side] : p " does not parse as Python")
    }
    function classify(header,   i, old, new, start) {
      if (!(header in entry)) return "regex"
      i = entry[header]
      old = olds[i]
      new = news[i]
      start = froms[i]
      cur_from = start
      cur_new = new
      if (mode == "verify" && ends(new, ".md") && (old == "" || ends(old, ".md"))) return "skip"
      if (!(("from", start) in known) && !(("to", new) in known)) return "regex"
      if (("from", start) in failed) {
        print script ": " reason("from", start) "; " fallback > "/dev/stderr"
        return "regex"
      }
      if (("to", new) in failed) {
        if (mode == "count") {
          print script ": " reason("to", new) "; " fallback > "/dev/stderr"
          return "regex"
        }
        print new ": does not parse as Python at " to
        return "skip"
      }
      return "py"
    }
    BEGIN {
      comment = "^[+][[:space:]]*(//|#[^[]|#$|[*]|/[*]|\"\"\"|[{]/[*]|<!--)"
      quiet = "^[-+][[:space:]]*(//|#[^[]|#$|[*]|/[*]|\"\"\"|[{]/[*]|<!--|-->|$)"
      script = mode == "count" ? "count-comment-lines.sh" : "verify-comments-only.sh"
      fallback = mode == "count" ? "counted by the regex" : "checked with the regex"
      ref["from"] = from
      ref["to"] = to
    }
    !patch && (/^== (from|to) -?[0-9]+$/ || $0 == "== diff") {
      if (side != "") close_side(side)
      side = $2
      rc[side] = $3 + 0
      if (side == "diff") patch = 1
      else open_side(side)
      next
    }
    !patch && side == "" {
      n++
      split($0, f, "\t")
      status[n] = f[1]
      olds[n] = f[2]
      news[n] = f[3]
      froms[n] = f[2] == "" ? f[3] : f[2]
      entry["diff --git a/" froms[n] " b/" news[n]] = n
      next
    }
    !patch { record(side, $0); next }
    /^diff --git / { hunk = 0; kind = classify($0); next }
    /^@@ / {
      split($2, o, ","); split($3, h, ","); hunk = 1
      left = substr(o[1], 2) + 0; right = substr(h[1], 2) + 0; next
    }
    !hunk { next }
    /^-/ {
      if (mode == "verify" && kind == "regex" && $0 !~ /^--- / && $0 !~ quiet) print
      else if (mode == "verify" && kind == "py" && !(("from", cur_from, left) in listed) && $0 !~ /^-[[:space:]]*$/) print
      left++
      next
    }
    /^\+/ {
      if (mode == "count" && kind == "py") { if (("to", cur_new, right) in listed) total++ }
      else if (mode == "count") { if (kind == "regex" && $0 ~ comment) total++ }
      else if (kind == "regex" && $0 !~ /^[+][+][+] / && $0 !~ quiet) print
      else if (kind == "py" && !(("to", cur_new, right) in listed) && $0 !~ /^[+][[:space:]]*$/) print
      right++
      next
    }
    /^ / { left++; right++ }
    END { if (mode == "count") print total + 0 }
  '
}
