# Finding taxonomy

Every comment carries one `category` (the stage that found it) and one `label` from that category. The label decides the severity emoji and the code prefix. Labels are plain English a PR author reads without a decoder ring; they are deliberately not the review skills' own identifiers.

## Labels and severity

| Category | Prefix | Label | Severity |
| --- | --- | --- | --- |
| `correctness` | `COR` | Bug | 🔴 |
| `correctness` | `COR` | Security | 🔴 |
| `correctness` | `COR` | Error handling | 🟠 |
| `correctness` | `COR` | Missing test | 🟠 |
| `correctness` | `COR` | Performance | 🟠 |
| `correctness` | `COR` | Separation of concerns | 🟠 |
| `correctness` | `COR` | Validation | 🟠 |
| `typeSafety` | `TPS` | Mixed on a boundary | 🟠 |
| `typeSafety` | `TPS` | Unchecked cast | 🟠 |
| `typeSafety` | `TPS` | Unstructured array | 🟠 |
| `typeSafety` | `TPS` | Duplicate type | 🟡 |
| `typeSafety` | `TPS` | Missing sanity check | 🟡 |
| `typeSafety` | `TPS` | Pseudo-type | 🟡 |
| `comments` | `DOC` | Wrong | 🔴 |
| `comments` | `DOC` | Delete | 🟡 |
| `comments` | `DOC` | Move | 🟡 |
| `comments` | `DOC` | Trim | 🟡 |
| `comments` | `DOC` | Unsure | ⚪ |

Severity meaning:

| Emoji | Meaning |
| --- | --- |
| 🔴 | Must fix before merge: a defect, a hole, or a comment that lies. |
| 🟠 | Should fix in this PR: a real weakness with a concrete fix. |
| 🟡 | Worth fixing; the author may defer with a reason. |
| ⚪ | A question, not a claim. Needs the author's answer. |

The emoji comes from the label alone. Do not grade severity by judgement; pick the label, and the severity follows.

## Translating stage vocabulary

The stage reports use their own identifiers. Translate each to the closest label; never invent a label and never carry the identifier into the comment.

### Type safety rule ids

| Rule id | Label |
| --- | --- |
| `PHP-1` (`mixed` where a narrower type is reachable) | Mixed on a boundary |
| `PHP-2` (array with a fixed key set where a DTO belongs) | Unstructured array |
| `PHP-3` (array-shape pseudo-type without a stated reason) | Pseudo-type |
| `PHP-4` (duplicate type) | Duplicate type |
| `PHP-5` (missing `strict_types`, return type, or collection generics) | Missing sanity check |
| `TS-1` (`any`) | Mixed on a boundary |
| `TS-1` (unchecked `as`) | Unchecked cast |
| `TS-2` (loose object where a discriminated union belongs) | Pseudo-type |
| `TS-3` (boundary data asserted with a cast instead of validated) | Unchecked cast |
| `TS-3` (boundary data typed `any` or `unknown` and never narrowed) | Mixed on a boundary |
| `TS-4` (duplicate type) | Duplicate type |

When the rule id and the finding's text disagree, the text wins: read what the reviewer found and pick the label that names it.

### Comment audit verdicts

| Verdict | Label |
| --- | --- |
| `DELETE` | Delete |
| `TRIM` | Trim |
| `MOVE` | Move |
| `UNSURE` | Unsure |
| `WRONG` | Wrong |
| `KEEP` | No comment. A KEEP that proposes a change is relabelled by what it proposes (usually Trim). A KEEP that proposes nothing is dropped. |

### Correctness findings

Correctness findings carry no identifier, only a pass label (`both passes`, `code-review only`, `hand review only`) that must not reach the author. Pick the label from the claim:

| The finding says | Label |
| --- | --- |
| Wrong result, crash, unhandled edge case, wrong condition | Bug |
| Missing authorization, injection, secret exposure, timing attack, unsafe deserialization | Security |
| Exception escapes, swallowed error, wrong catch scope, missing rollback | Error handling |
| A path with no test, an assertion that cannot fail | Missing test |
| N+1, unbounded query, work inside a loop that belongs outside it | Performance |
| Business logic in a controller or view, data access leaking across layers, a class doing two jobs | Separation of concerns |
| Input reaches logic unchecked, a request field with no rule | Validation |

A finding two labels fit takes the more severe one.
