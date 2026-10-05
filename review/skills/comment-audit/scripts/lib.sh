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
# to the top from any directory; --no-textconv and --submodule=short keep the
# patch to the committed lines; the rest keep the `diff --git a/OLD b/NEW`
# header literal for route_diff under diff.noprefix, color, an external diff
# tool, and non-ASCII paths.
git_diff() {
  git -c core.quotePath=false diff -M --no-relative --no-color --no-ext-diff \
    --no-textconv --submodule=short --src-prefix=a/ --dst-prefix=b/ "$@"
}

# Reads one `git diff --name-status -z` entry from stdin into status, old (set
# only for a rename), and path. Returns 1 at the end of input. It relies on
# git_diff's -M, which reports no copies: a C entry carries two paths too.
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
# holds a control character, `"` or `\`: these are the characters git quotes
# in a `diff --git` header, so route_diff could not match the header. They are
# never sent to the helper, and route_diff reports them.
read_changes() {
  statuses=()
  olds=()
  paths=()

  while read_change; do
    case $old$path in
      *[[:cntrl:]]* | *[\"\\]*) continue ;;
    esac
    statuses+=("$status")
    olds+=("$old")
    paths+=("$path")
  done
}

# Prints `== SIDE N` and the N lines of OUTPUT, leaving out empty ones.
# Splitting into an array keeps N and the lines in step, in linear time where
# bash 3.2's ${OUTPUT//pattern/} is quadratic.
emit_section() {
  local IFS=$'\n' lines

  set -f
  lines=($2)
  set +f
  printf '== %s %s\n' "$1" "${#lines[@]}"
  [ "${#lines[@]}" -eq 0 ] || printf '%s\n' "${lines[@]}"
}

# Usage: emit_stream SIDES DIFF_ARGS... Prints route_diff's stream for the
# changes read_changes read: SIDES lists the helper's sides (`from to`, `to`,
# or empty without python3), each side's output in $from_out or $to_out.
emit_stream() {
  local sides=$1 side out i
  shift

  for ((i = 0; i < ${#paths[@]}; i++)); do
    printf '%s\t%s\t%s\n' "${statuses[i]}" "${olds[i]}" "${paths[i]}"
  done

  for side in $sides; do
    out=${side}_out
    emit_section "$side" "${!out}"
  done

  printf '== diff\n'
  git_diff -U0 "$@"
}

# Usage: route_diff MODE FROM TO < stream, MODE count or verify. The stream is
# one `STATUS<TAB>OLD<TAB>NEW` line per changed file; when python3 is on PATH,
# `== from N` (verify only) and `== to N`, each followed by exactly N lines of
# that side's helper output; then `== diff` and a -U0 patch from git_diff.
# Each file section is routed by its header: a Python file the helper listed
# uses the listed line numbers, one it failed on at FROM (or, in count, at TO)
# is reported on stderr and uses the regex, and every other file uses the
# regex. count prints the number of added comment lines; verify prints every
# changed line that is not a comment or blank, markdown on both sides
# excluded, and `PATH: does not parse as Python at TO` for a file the helper
# failed on at TO but not at FROM. awk runs in the C locale because paths and
# content are bytes, not always UTF-8.
route_diff() {
  LC_ALL=C awk -v mode="$1" -v from="$2" -v to="$3" '
    function ends(s, suffix) {
      return (substr(s, length(s) - length(suffix) + 1) == suffix)
    }
    # The paths a side was sent: every changed file whose new name ends in
    # .py and that exists on that side, under its name there.
    function open_side(side,   i) {
      for (i = 1; i <= n; i++) {
        if (!ends(news[i], ".py")) continue
        if (side == "from" && status[i] != "A") known[side, froms[i]] = 1
        if (side == "to" && status[i] != "D") known[side, news[i]] = 1
      }
    }
    # `== done` ends a finished batch; `PATH<TAB>N` lists line N of PATH;
    # `PATH<TAB>MESSAGE` for a known PATH fails it; anything else is the
    # interpreter failing as a whole.
    function record(side, line,   p, pos, rest, i) {
      if (line == "== done") {
        complete[side] = 1
        return
      }
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
    # A side whose helper never printed `== done` died partway, so every file
    # of it without a failure record fails, with the first stray line as the
    # reason when there is one.
    function close_side(side,   k, parts) {
      if (side in complete) return
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
    # A header with no registry line names a path read_changes left out
    # because git quotes it. One path on both sides that is markdown stays
    # skipped in verify; a Python path is named on stderr and uses the regex.
    function unregistered(header, seen,   r, p, same) {
      r = substr(header, length("diff --git ") + 1)
      if (substr(r, 1, 1) == "\"") {
        p = substr(r, 4, (length(r) - 9) / 2)
        same = (r == "\"a/" p "\" \"b/" p "\"")
      } else {
        p = substr(r, 3, (length(r) - 5) / 2)
        same = (r == "a/" p " b/" p)
      }
      if (same && mode == "verify" && ends(p, ".md")) return "skip"
      if (same ? ends(p, ".py") : (ends(r, ".py\"") || ends(r, ".py"))) {
        if (!seen) print script ": " r " is a path git quotes; " fallback > "/dev/stderr"
      }
      return "regex"
    }
    # A typechange has two sections under one header, so seen keeps each
    # message to one print.
    function classify(header,   i, old, new, start, seen) {
      seen = (header in reported)
      reported[header] = 1
      if (!(header in entry)) return unregistered(header, seen)
      i = entry[header]
      old = olds[i]
      new = news[i]
      start = froms[i]
      cur_from = start
      cur_new = new
      if (mode == "verify" && ends(new, ".md") && (old == "" || ends(old, ".md"))) return "skip"
      if (!(("from", start) in known) && !(("to", new) in known)) return "regex"
      if (("from", start) in failed) {
        if (!seen) print script ": " reason("from", start) "; " fallback > "/dev/stderr"
        return "regex"
      }
      if (("to", new) in failed) {
        if (mode == "count") {
          if (!seen) print script ": " reason("to", new) "; " fallback > "/dev/stderr"
          return "regex"
        }
        if (!seen) print new ": does not parse as Python at " to
        return "skip"
      }
      return "py"
    }
    BEGIN {
      markers = "//|#[^[]|#$|[*]|/[*]|\"\"\"|[{]/[*]|<!--"
      # dash: -- then anything (so ---, --!, --[[ and --text). mysql: MySQL
      # reads --1 as code, so -- needs whitespace or the end of the line after
      # it. hs: two or more dashes then a character outside the ASCII Haskell
      # symbol set, or the end of the line, so --> and --| stay operators;
      # \\\\ is one literal backslash.
      dash = "--"
      mysql = "--[[:space:]]|--$"
      hs = "--+([^!#$%&*+./<=>?@^|~:\\\\-]|$)"
      comment["code"] = "^[+][[:space:]]*(" markers ")"
      comment["dash"] = "^[+][[:space:]]*(" markers "|" dash ")"
      comment["mysql"] = "^[+][[:space:]]*(" markers "|" mysql ")"
      comment["hs"] = "^[+][[:space:]]*(" markers "|" hs ")"
      quiet["code"] = "^[-+][[:space:]]*(" markers "|-->|$)"
      quiet["dash"] = "^[-+][[:space:]]*(" markers "|" dash "|$)"
      quiet["mysql"] = "^[-+][[:space:]]*(" markers "|-->|" mysql "|$)"
      quiet["hs"] = "^[-+][[:space:]]*(" markers "|" hs "|$)"
      script = mode == "count" ? "count-comment-lines.sh" : "verify-comments-only.sh"
      fallback = mode == "count" ? "counted by the regex" : "checked with the regex"
      ref["from"] = from
      ref["to"] = to
    }
    !patch && remaining > 0 { remaining--; record(side, $0); next }
    !patch && (/^== (from|to) [0-9]+$/ || $0 == "== diff") {
      if (side != "") close_side(side)
      side = $2
      remaining = $3 + 0
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
    # `--` is a comment only where the language says so; the new name of the
    # section, the last path of the header, picks the regex pair.
    /^diff --git / {
      hunk = 0; kind = classify($0)
      if ($0 ~ /[.](hs|lhs)"?$/) lang = "hs"
      else if ($0 ~ /[.]mysql"?$/) lang = "mysql"
      else if ($0 ~ /[.](sql|psql|pgsql|lua|elm|ada|adb|ads|vhd|vhdl)"?$/) lang = "dash"
      else lang = "code"
      next
    }
    /^@@ / {
      split($2, o, ","); split($3, h, ","); hunk = 1
      left = substr(o[1], 2) + 0; right = substr(h[1], 2) + 0; next
    }
    !hunk { next }
    /^-/ {
      if (mode == "verify" && kind == "regex" && $0 !~ quiet[lang]) print
      else if (mode == "verify" && kind == "py" && !(("from", cur_from, left) in listed) && $0 !~ /^-[[:space:]]*$/) print
      left++
      next
    }
    /^\+/ {
      if (mode == "count" && kind == "py") { if (("to", cur_new, right) in listed) total++ }
      else if (mode == "count") { if (kind == "regex" && $0 ~ comment[lang]) total++ }
      else if (kind == "regex" && $0 !~ quiet[lang]) print
      else if (kind == "py" && !(("to", cur_new, right) in listed) && $0 !~ /^[+][[:space:]]*$/) print
      right++
      next
    }
    /^ / { left++; right++ }
    END { if (mode == "count") print total + 0 }
  '
}
