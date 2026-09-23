# Finding taxonomy

Every comment carries one `category` (the stage that found it) and one `label` from that category. The label decides the severity emoji and the code prefix. Labels are plain English a PR author reads without a decoder ring; they are deliberately not the review skills' own identifiers.

## Labels and severity

| Category | Prefix | Label | Severity |
| --- | --- | --- | --- |
| `correctness` | `COR` | Bug | 🔴 |
| `correctness` | `COR` | Security | 🔴 |
| `correctness` | `COR` | Accessibility | 🟠 |
| `correctness` | `COR` | Error handling | 🟠 |
| `correctness` | `COR` | Missing test | 🟠 |
| `correctness` | `COR` | Performance | 🟠 |
| `correctness` | `COR` | Separation of concerns | 🟠 |
| `correctness` | `COR` | Validation | 🟠 |
| `correctness` | `COR` | Convention | 🟡 |
| `correctness` | `COR` | Dead code | 🟡 |
| `correctness` | `COR` | Duplication | 🟡 |
| `correctness` | `COR` | Edge case | 🟡 |
| `correctness` | `COR` | Question | ⚪ |
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

| Emoji | Meaning | Verdict |
| --- | --- | --- |
| 🔴 | Must fix before merge: a defect, a hole, or a comment that lies. | Blocks |
| 🟠 | Should fix in this PR: a real weakness with a concrete fix. | Blocks |
| 🟡 | Worth fixing; the author may defer with a reason. | Does not block |
| ⚪ | A question, not a claim. Needs the author's answer. | Does not block |

The emoji comes from the label alone. Do not grade severity by judgement; pick the label, and the severity follows. The verdict follows the severities present, in every category: `request_changes` while any 🔴 or 🟠 survives, `comment` when only 🟡 and ⚪ survive, `approve` when nothing survives and every stage reported.

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

Correctness findings carry no identifier, only a pass label (`both passes`, `code-review only`, `hand review only`) that must not reach the author. Each finding from the hand-review pass ends with an outcome clause: crash, wrong data shown, wrong data persisted, harmless, or question. Pick the label from the claim and the outcome:

| The finding says | Label |
| --- | --- |
| Wrong result, crash, wrong data shown or persisted, wrong condition, on input the code is meant to handle | Bug |
| Missing authorization, injection, secret exposure, timing attack, unsafe deserialization | Security |
| A named WCAG criterion or the project's accessibility rule broken: accessible name, role, live region, contrast, focus order | Accessibility |
| Exception escapes, swallowed error, wrong catch scope, missing rollback | Error handling |
| A path with no test, an assertion that cannot fail | Missing test |
| N+1, unbounded query, work inside a loop that belongs outside it | Performance |
| Business logic in a controller or view, data access leaking across layers, a class doing two jobs, a dependency pointing the wrong way, in code something calls | Separation of concerns |
| Input reaches logic unchecked, a request field with no rule | Validation |
| A project rule or house style broken with no behaviour effect: naming, file layout, test structure, complexity budget | Convention |
| Code with no production caller, a branch that cannot execute, a loop or guard with no effect | Dead code |
| The same rule, predicate, or constant written in more than one place with nothing keeping them equal. Duplicate types go to type safety as Duplicate type | Duplication |
| Behaviour differs on unusual input (empty, malformed, hand-edited, out of order) and the outcome is harmless: no crash, no wrong data shown or persisted, clears on retry or reload | Edge case |
| The reviewer asks the author something the diff could not settle, and claims no defect | Question |

A finding two labels fit takes the more severe one. The outcome clause is what keeps the pairs apart: a crash on empty input is a Bug, not an Edge case; a public method with no caller that is still reachable from a route is Separation of concerns, not Dead code, while code nothing calls is Dead code even when it also sits in the wrong layer; a rule broken in a way that changes behaviour is whatever that behaviour is, not Convention. A finding with no outcome clause, which is every finding from the `code-review` pass, takes the more severe label. Pick from what the finding says is wrong, not from what its suggested fix would also improve: a broken complexity budget or a copied rule whose fix would also split two jobs or move logic out of a controller stays Convention or Duplication.
