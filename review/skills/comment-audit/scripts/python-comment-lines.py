#!/usr/bin/env python3
"""Print the comment line numbers of Python files at a git ref.

Usage: python-comment-lines.py REF PATH
       python-comment-lines.py REF < NUL-separated paths

With PATH, prints one 1-based line number per line, ascending, and exits 1 with
one line on stderr when the file cannot be read, tokenized, or parsed. Without
PATH, reads NUL-separated paths from stdin, fetches every blob with one
`git cat-file --batch`, and prints `path<TAB>line` records in input order; a
path that cannot be read or parsed is reported on stderr as `path<TAB>message`,
skipped, and makes the exit status 1.

A comment line holds a `#` comment with nothing before it, or belongs to a
module, class, or function docstring in any quote style. A docstring line that
it shares with code, a blank docstring line, and a doctest example (a `>>>` or
`...` line and every line after it up to a blank one) are not comment lines.
Tool directives (a shebang, an encoding declaration, `# noqa`, `# type:`,
`# fmt:` and the like), also after a docstring's closing quotes, are not
comment lines: changing one changes what a tool does. Needs Python 3.8 or
later for the `end_lineno` attribute.
"""

from __future__ import annotations

import ast
import io
import os
import re
import subprocess
import sys
import tokenize

DIRECTIVES = (
    "noqa",
    "type:",
    "pragma:",
    "fmt:",
    "pyright:",
    "mypy:",
    "ruff:",
    "isort:",
    "nosec",
    "complexipy:",
    "pylint:",
    "ty:",
    "pyrefly:",
    "flake8:",
    "pyre-ignore",
    "pyre-fixme",
    "pytype:",
    "yapf:",
    "nosemgrep",
)

# flake8, ruff, and bandit read these in any case.
ANY_CASE_DIRECTIVES = ("noqa", "nosec")

# Coverage's default exclusion pattern.
NO_COVER = re.compile(r"pragma[:\s]*no\s*cover", re.IGNORECASE)

# PEP 263: the interpreter reads an encoding declaration on line 1 or 2.
CODING = re.compile(r"^[ \t\f]*#.*?coding[:=]")

DOCSTRING_OWNERS = (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)


PARSE_ERRORS = (SyntaxError, tokenize.TokenError, UnicodeDecodeError, ValueError)


def read_blobs(ref: str, paths: list[str]) -> dict[str, bytes | str]:
    """Map each path to its content at ref, or to the reason it has none, with
    one git process for the whole list."""
    queries = "".join(f"{ref}:{path}\n" for path in paths)
    output = subprocess.run(
        ["git", "cat-file", "--batch"],
        input=os.fsencode(queries),
        capture_output=True,
        check=True,
    ).stdout
    blobs: dict[str, bytes | str] = {}
    position = 0

    for path in paths:
        end = output.index(b"\n", position)
        fields = os.fsdecode(output[position:end]).rsplit(" ", 2)
        position = end + 1

        # `<sha> <type> <size>`, or `<query> missing` / `<query> ambiguous`.
        if len(fields) < 3 or not fields[2].isdigit():
            blobs[path] = fields[-1]
            continue

        kind, size = fields[1], int(fields[2])
        content = output[position : position + size]
        position += size + 1
        blobs[path] = content if kind == "blob" else f"is a {kind}, not a file"

    return blobs


def is_directive(token: tokenize.TokenInfo) -> bool:
    row = token.start[0]

    if row == 1 and token.string.startswith("#!"):
        return True

    if row <= 2 and CODING.match(token.string):
        return True

    return starts_with_directive(token.string)


def starts_with_directive(comment: str) -> bool:
    text = comment[1:].strip()

    return (
        text.startswith(DIRECTIVES)
        or text.lower().startswith(ANY_CASE_DIRECTIVES)
        or NO_COVER.match(text) is not None
    )


def get_comment_lines(source: bytes) -> set[int]:
    lines: set[int] = set()

    for token in tokenize.tokenize(io.BytesIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue

        row, column = token.start

        if token.line[:column].strip() == "" and not is_directive(token):
            lines.add(row)

    return lines


def get_source_lines(source: bytes) -> list[bytes]:
    encoding, _ = tokenize.detect_encoding(io.BytesIO(source).readline)
    text = source.decode(encoding).replace("\r\n", "\n").replace("\r", "\n")

    # `ast` column offsets count UTF-8 bytes whatever the file's encoding.
    return [line.encode("utf-8") for line in text.split("\n")]


def get_docstring_lines(tree: ast.Module, source: list[bytes]) -> set[int]:
    lines: set[int] = set()

    for node in ast.walk(tree):
        if not isinstance(node, DOCSTRING_OWNERS) or not node.body:
            continue

        first = node.body[0]

        if not (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            continue

        start = first.lineno
        end = first.end_lineno or start
        before = source[start - 1][: first.col_offset].strip()
        after = source[end - 1][first.end_col_offset :].strip()
        opens_alone = before == b""
        closes_alone = after == b"" or (
            after.startswith(b"#") and not starts_with_directive(after.decode("utf-8"))
        )

        if start == end:
            if opens_alone and closes_alone:
                lines.add(start)

            continue

        doctest = False

        for row in range(start + 1, end):
            text = source[row - 1].strip()
            doctest = text != b"" and (doctest or text.startswith((b">>>", b"...")))

            if text != b"" and not doctest:
                lines.add(row)

        if opens_alone:
            lines.add(start)

        if closes_alone:
            lines.add(end)

    return lines


def analyze(source: bytes) -> set[int]:
    return get_docstring_lines(ast.parse(source), get_source_lines(source)) | get_comment_lines(
        source
    )


def describe(ref: str, path: str, error: object) -> str:
    version = f"{sys.version_info.major}.{sys.version_info.minor}"

    return f"python-comment-lines.py: {path} at {ref}: {error} (under {sys.executable} {version})"


def comment_lines(
    ref: str, paths: list[str]
) -> tuple[dict[str, set[int]], dict[str, str]]:
    """The comment lines of every path that could be read and parsed at ref, and
    a message for every path that could not."""
    lines: dict[str, set[int]] = {}
    failures: dict[str, str] = {}
    queryable = [path for path in paths if "\n" not in path]

    for path in paths:
        if "\n" in path:
            failures[path] = describe(ref, path, "the path contains a newline")

    try:
        blobs = read_blobs(ref, queryable)
    except subprocess.CalledProcessError as error:
        for path in queryable:
            failures[path] = describe(ref, path, error)

        return lines, failures

    for path in queryable:
        blob = blobs[path]

        if isinstance(blob, str):
            failures[path] = describe(ref, path, blob)
            continue

        try:
            lines[path] = analyze(blob)
        except PARSE_ERRORS as error:
            failures[path] = describe(ref, path, error)

    return lines, failures


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3):
        print("usage: python-comment-lines.py REF [PATH]", file=sys.stderr)

        return 2

    ref = argv[1]

    if len(argv) == 3:
        path = argv[2]
        lines, failures = comment_lines(ref, [path])

        if path in failures:
            print(failures[path], file=sys.stderr)

            return 1

        for line in sorted(lines[path]):
            print(line)

        return 0

    paths = [os.fsdecode(path) for path in sys.stdin.buffer.read().split(b"\0") if path]
    lines, failures = comment_lines(ref, paths)

    for path in paths:
        for line in sorted(lines.get(path, ())):
            sys.stdout.buffer.write(os.fsencode(f"{path}\t{line}\n"))

    for path in paths:
        if path in failures:
            sys.stderr.buffer.write(os.fsencode(f"{path}\t{failures[path]}\n"))

    sys.stdout.buffer.flush()

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
