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

A finding two labels fit takes the more severe one, unless a sentence below settles the pair. The outcome clause separates Bug from Edge case and Question: a crash on empty input is a Bug, not an Edge case, and a finding with no outcome clause, which is every finding from the `code-review` pass, takes Bug over either. The other softer labels turn on a fact the claim states, not on the outcome, so they apply with or without an outcome clause: a method nothing calls directly but a route dispatches to is Separation of concerns, not Dead code, while code nothing calls is Dead code even when it also sits in the wrong layer; a rule broken in a way that changes behaviour is whatever that behaviour is, not Convention. Pick from what the finding says is wrong, not from what its suggested fix would also improve: a broken complexity budget or a copied rule whose fix would also split two jobs or move logic out of a controller stays Convention or Duplication.

#### Examples

Paraphrased from real findings, one per pair the rows above keep apart. The right-hand column names the fact that decided the label.

| The finding says | Label | Because |
| --- | --- | --- |
| The page sorts the list newest first, but the server reads the same list unsorted for the dashboard's "latest report", so on a journey with two reports the two can disagree. Outcome: wrong data shown. | Bug | Wrong data on input the code is meant to handle. |
| A URL carrying `?category=` reaches the effect, which returns early, so the bare parameter stays in the address bar. A reload reads it as "no category" again. Outcome: harmless. | Edge case | Hand-edited input, and the effect clears on reload. |
| `readCategory()` returns `null` for an empty string and the caller dereferences the result. Outcome: crash. | Bug | Unusual input, but the outcome is a crash, so the harmless condition fails. |
| The link's visible text is "View results", but `aria-label` replaces the accessible name with a string that does not contain those words, failing WCAG 2.5.3. | Accessibility | A named WCAG criterion. Not a Bug: the data and the flow are right. |
| `/results` renders a page component that does not exist on this branch. Harmless if the stack merges atomically. Worth confirming that is the plan. Outcome: question. | Question | The reviewer asks and claims no defect. The same text with no outcome clause is a Bug. |
| `Cache::forget($key)` in this loop can never evict anything: the key is never written, because every reader passes `ttl: 0`. | Dead code | A loop with no effect. Not a Bug: nothing anyone sees changes. |
| `fromReport()` has no production caller. Its only references are its own test and the generated types. It also sits in a different service from the DTO it is built from. | Dead code | Nothing calls it. The wrong layer would make it Separation of concerns only if something did. |
| The same `report_if(...)` predicate appears verbatim at three call sites, so a fourth exception type gets reported by all of them without anyone deciding. | Duplication | One rule written three times. The fix, a method on the exception, would also move logic, but the label follows what is wrong, not the fix. |
| The controller builds `productName` with a display-name helper, when the thin-controller rule allows one service call and the DTO should carry the name. | Separation of concerns | Business logic in a controller that a route calls. |
| The shell's navigation hook imports a predicate from a page module. The sibling hook takes its equivalent from `lib/`. | Separation of concerns | A dependency pointing the wrong way, in code something calls. |
| The test file covers two exports and only one gets a `describe`; the project's testing rule asks for one per function under test. | Convention | Test structure, no behaviour effect. |
| The component scores 51.6 against the complexity cap of 52, so the next few lines added here trip the gate. | Convention | A complexity budget. The fix would split the component, but the finding names the budget, not two jobs. |
| The export was renamed to `findLatestFile` but the file is still `newestFile.ts`, so every importer reads the new name from the old path. | Convention | Naming, no behaviour effect. |
