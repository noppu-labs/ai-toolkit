#!/usr/bin/env python3
"""Print the comment line numbers of one Python file at a git ref.

Usage: python-comment-lines.py REF PATH

Prints, one per line and in ascending order, the 1-based number of every line
that holds a `#` comment with nothing before it, or that belongs to a module,
class, or function docstring in any quote style. Tool directives (a shebang, an
encoding declaration, `# noqa`, `# type:`, `# fmt:` and the like) are not
comment lines: changing one changes what a tool does. Exits 1 with one line on
stderr when the file cannot be read, tokenized, or parsed.
"""

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
)

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

    return token.string[1:].strip().lower().startswith(DIRECTIVES)


def get_comment_lines(source: bytes) -> set[int]:
    lines: set[int] = set()

    for token in tokenize.tokenize(io.BytesIO(source).readline):
        if token.type != tokenize.COMMENT:
            continue

        row, column = token.start

        if token.line[:column].strip() == "" and not is_directive(token):
            lines.add(row)

    return lines


def get_docstring_lines(tree: ast.Module) -> set[int]:
    lines: set[int] = set()

    for node in ast.walk(tree):
        if not isinstance(node, DOCSTRING_OWNERS) or not node.body:
            continue

        first = node.body[0]

        if (
            isinstance(first, ast.Expr)
            and isinstance(first.value, ast.Constant)
            and isinstance(first.value.value, str)
        ):
            lines.update(range(first.lineno, (first.end_lineno or first.lineno) + 1))

    return lines


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: python-comment-lines.py REF PATH", file=sys.stderr)

        return 2

    ref, path = argv[1], argv[2]

    try:
        source = read_blob(ref, path)
        lines = get_docstring_lines(ast.parse(source)) | get_comment_lines(source)
    except (
        subprocess.CalledProcessError,
        SyntaxError,
        tokenize.TokenError,
        UnicodeDecodeError,
        ValueError,
    ) as error:
        print(f"python-comment-lines.py: {path} at {ref}: {error}", file=sys.stderr)

        return 1

    for line in sorted(lines):
        print(line)

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
