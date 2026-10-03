#!/usr/bin/env python3
"""Print the comment line numbers of one Python file at a git ref.

Usage: python-comment-lines.py REF PATH

Prints, one per line and in ascending order, the 1-based number of every line
that holds a `#` comment with nothing before it, or that belongs to a module,
class, or function docstring in any quote style. A docstring line that it
shares with code, a blank docstring line, and a doctest example (a `>>>` or
`...` line and every line after it up to a blank one) are not comment lines.
Tool directives (a shebang, an encoding declaration, `# noqa`, `# type:`,
`# fmt:` and the like), also after a docstring's closing quotes, are not
comment lines: changing one changes what a tool does. Exits 1 with one line on
stderr when the file cannot be read, tokenized, or parsed. Needs Python 3.8 or
later for the `end_lineno` attribute.
"""

from __future__ import annotations

import ast
import io
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


def read_blob(ref: str, path: str) -> bytes:
    return subprocess.run(
        ["git", "show", f"{ref}:{path}"],
        capture_output=True,
        check=True,
    ).stdout


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


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: python-comment-lines.py REF PATH", file=sys.stderr)

        return 2

    ref, path = argv[1], argv[2]

    try:
        source = read_blob(ref, path)
        docstrings = get_docstring_lines(ast.parse(source), get_source_lines(source))
        lines = docstrings | get_comment_lines(source)
    except (
        subprocess.CalledProcessError,
        SyntaxError,
        tokenize.TokenError,
        UnicodeDecodeError,
        ValueError,
    ) as error:
        version = f"{sys.version_info.major}.{sys.version_info.minor}"
        print(
            f"python-comment-lines.py: {path} at {ref}: {error}"
            f" (under {sys.executable} {version})",
            file=sys.stderr,
        )

        return 1

    for line in sorted(lines):
        print(line)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
