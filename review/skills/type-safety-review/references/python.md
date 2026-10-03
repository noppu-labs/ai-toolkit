# Python rules

## PY-1: no `Any` where a narrower type is reachable

`Any` is a finding when the value's origin has a known type, or when `object`, a union of two or three concrete types, a `Protocol`, or a `TypeVar` describes it. Cite the narrowing that was possible. `Any` is not a finding at a boundary that accepts arbitrary input and narrows on the next line, on a `**kwargs` forwarded untouched to a typed callee, or on an object from a third-party package that ships no stubs, such as a database driver handle: there the narrowing is not reachable and the candidate is dropped with that reason. Checks a reviewer can cite: ruff `ANN401`, mypy `--warn-return-any` and `--disallow-any-explicit`, and pyright `reportUnknownParameterType` and its siblings under `typeCheckingMode = "strict"`.

## PY-2: structured data crosses boundaries as a dataclass, pydantic model, or `NamedTuple`

A function that returns or accepts a `dict` with a fixed key set, and whose caller reads named keys from it, is a finding. Propose the class. The usual shape is a web route whose request body is a pydantic model but whose response is a hand-built `dict` with no return annotation and no `response_model`: the inbound boundary is typed and the outbound one is not. Dicts with dynamic keys, lists, and mappings of primitives are not findings. A `TypedDict` is ruled on under PY-3.

## PY-3: `TypedDict` and `# type: ignore` need a stated reason; `cast()` needs a check

A `TypedDict` is acceptable for a wire shape that is received and mutated before a model is assembled, when the reason is visible at the declaration. A `typing.cast()` is a finding when nothing checked the value; a `cast()` after an `isinstance`, a pydantic `model_validate`, or a schema check is not. A `# type: ignore` without an error code is a finding (ruff `PGH003`), and one with a code but no reason is a finding when a narrowing would do instead. Data from `json.loads`, a request body, environment variables, or YAML is validated with pydantic, a `TypedDict` plus a validator, or a `TypeGuard`, never asserted with `cast()`.

## PY-4: no duplicate types

Two dataclasses or models with the same field set, a `TypedDict` mirroring a pydantic model, or a class that is another class plus one field, are a finding. Propose inheritance, a shared base, a generic, or deriving one from the other. Judge by shape, not by name.

## PY-5: sanity checks

- A return annotation on every `def`, including `-> None` and `-> NoReturn`. Ruff `ANN201`, `ANN202`, `ANN204`, `ANN205`, and `ANN206` report a missing one.
- Type arguments on every generic: `list[Item]`, `dict[str, int]`, never a bare `list` or `dict`. Mypy `type-arg` and pyright `reportMissingTypeArgument` report a bare one.
- A type checker configured for the package (`[tool.mypy]`, `[tool.pyright]`, `[tool.pyrefly]`, or `[tool.ty]` in `pyproject.toml`, or the checker's own config file) and passing on the head ref. A project with no checker is one finding, not one per file. A checker at its default strictness is not a finding.
- No `from typing import List, Dict, Optional` where the 3.10 syntax is available at the project's `requires-python`. Ruff `UP035` reports the `List` and `Dict` imports, `UP006` their use in annotations, and `UP045` `Optional`.
