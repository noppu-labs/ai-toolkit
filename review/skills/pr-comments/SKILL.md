---
name: pr-comments
description: Use when a code review report (the pr-review consolidated report, a single stage report, or pasted findings) has to become comments a pull request author reads, anchored to a file and line, graded for severity, and referenceable by a code. Also use when asked to format, post, clean up, or grade review findings for a PR.
---

# PR comments

A review report is written for the reviewer. This skill rewrites it for the PR author: one comment per finding, a severity emoji and a code such as `COR-01` that the label decides, and a body in plain words that names the problem, cites the code, and states the fix. The codes and severity come from a script, never from judgement, so two runs over the same findings grade them the same way.

## Invocation

`/review:pr-comments [key=value ...]`

| Argument | Meaning |
| --- | --- |
| `report=` | Path to the report. Without it, the report is the one in the conversation. |
| `pr=` | PR number, used only in the summary. |
| `format=` | `markdown` (default) or `json`. |
| `out=` | Path the result is written to. Without it, the result is the response. |

This skill changes nothing in the repository and posts nothing. Whoever calls it decides what to do with the comments.

## Read first

- [references/taxonomy.md](references/taxonomy.md): the labels, their severity, and how stage vocabulary translates to them.
- [../writing-comments/references/style.md](../writing-comments/references/style.md): the voice every body is written in.

## Step 1: collect

Walk every stage section of the report and take one entry per finding. Each entry needs a `path:line` on the head side of the diff; a finding with no anchor is a diagnostics note, not a comment.

- A comment-audit `TRIM` or `DELETE` also needs the span of the comment it rules on, as HEAD lines. The comments stage gives it as `L<start>-L<end>`; when only `L<start>` is given, the end is the start plus the verbatim comment's line count minus one. That span becomes `suggestion.startLine` and `suggestion.endLine`.
- A comment-audit `KEEP` that proposes no change is dropped. A `KEEP` that proposes a change is kept and labelled by what it proposes.
- A finding listed under two stages appears once, under the stage that ruled on it most precisely.
- At most 20 correctness, 20 type safety, and 40 comment findings. When a cap cuts, the least severe go first, and the cut is recorded in diagnostics.

Order: correctness, then type safety, then comments, each in the order the report gave them.

## Step 2: classify

Each entry gets a `category`, the stage it came from (`correctness`, `typeSafety`, `comments`), and a `label` copied verbatim from that category's list in the taxonomy. Translate the stage's own identifiers with the taxonomy's tables: `PHP-2` becomes `Unstructured array`, a `DELETE` verdict becomes `Delete`. Pick the closest label; never invent one. When two fit, take the more severe. For correctness findings the outcome clause at the end of the finding (crash, wrong data shown, wrong data persisted, harmless, question) separates Bug from Edge case and Question, and a finding without one that could be either takes Bug. Dead code, Duplication, and Convention turn on a fact the claim states instead (no caller, a second copy, no behaviour effect), so they apply to a finding with no outcome clause too; the taxonomy's correctness section settles those pairs.

## Step 3: write the body

Every body is written for an engineer who has never heard of this review and reads the comment cold, in any order. A body is:

1. The problem, in one or two sentences, naming the symbol or line it is about.
2. The fix, concrete enough to act on: the call to make, the check to add, the type to declare.
3. When the report proposed code and the entry carries no `suggestion`, that code in a fenced block. With a `suggestion`, no fenced block: the suggestion is the code.

Nothing else. The header, emoji, and code are added by the script in step 6; a body starts with the problem. The body names only the author's code: what the review could or could not run, and which stage or pass found the finding, go to diagnostics in step 4. Follow `style.md`. The humanizer pass over the bodies is step 5, so write each body in full here and leave the pass to that step.

One body from the report's entry, not the report's entry quoted and then paraphrased.

### Suggestions

An entry may carry `suggestion: { "startLine": n, "endLine": m, "replacement": "..." }`: `replacement` is HEAD lines `startLine` to `endLine` as they should read after the fix, lines joined with `\n` and no trailing newline, or the empty string to delete them. GitHub renders it as a diff the author applies with one click, so fill it only when applying it fixes the finding entirely:

- At most six lines replaced, and the range contains `line`.
- One location. A fix that also needs a change elsewhere stays prose.
- Literal file text, never a description of a change. It is not scrubbed or edited.
- Built from those lines as read from the file at HEAD, not from the report's quote: indentation and comment markers (`//`, ` * `, `#`) stay as the file has them.
- A comment that shares a line with code, or a description beside a type annotation (`@param`, `@return`, `@var`, and similar), keeps that code or annotation in the replacement, or the finding stays prose. An empty replacement is only for lines that are wholly comment.

By category:

- `comments`: `Trim` and `Delete` carry one when the comment's span is six lines or fewer: the audit's rewrite applied to those HEAD lines (`Delete`: empty string when they are wholly comment); a longer span stays prose. `Move` and `Wrong` never do (a MOVE touches two files, a WRONG needs the author's knowledge); `Unsure` is a question.
- `correctness`: only when the report proposed code that meets the rules above and the label is not `Question`.
- `typeSafety`: none by default. A proposed shape almost always needs call-site changes, so it fails the one-location rule.

Body prose stays: the problem, then the fix in one sentence.

## Step 4: verdict, summary, diagnostics

Verdict:

- `request_changes` when any 🔴 or 🟠 comment survives, in any category.
- `comment` when comments survive and every one is 🟡 or ⚪, or when nothing survives but a stage did not report.
- `approve` when nothing survives and every stage reported. A stage missing from the report is never treated as clean.

Summary: two to four sentences on what the review found in the author's code, in the same voice as the bodies. No greeting, no praise, no sign-off.

Diagnostics: everything the summary may not say, for whoever runs the review rather than the author. A stage that did not report, a tool that was unavailable, a cap that cut findings, a conclusion that could not be verified. Empty when the review ran clean and complete and step 5 had nothing to add.

## Step 5: humanize

Look for a skill named `humanizer` in the list of available skills. The list decides what happens next; there is no third outcome.

If it is listed, invoke it with the Skill tool and apply it to every body and to the summary, before the script in step 6 runs. The pass changes wording only. Every technical claim, path, line, symbol, version string, command, and fenced code block comes out of the pass exactly as it went in, and each body keeps its order: problem, then fix, then code. When the pass has changed one of those, restore it from the text written in step 3 and keep the rest of the rewrite.

If it is not listed, continue without it and add one plain sentence to diagnostics saying the bodies and summary were not humanized because the `humanizer` skill was not available. Do not stop and do not fail. The sentence goes in diagnostics only, never in the summary or a body; the author never sees diagnostics.

## Step 6: render

Write the classified entries to a JSON file in the scratchpad:

```json
{
  "verdict": "request_changes",
  "summary": "...",
  "diagnostics": "",
  "comments": [
    { "path": "app/Services/DiscountSync.php", "line": 88, "category": "correctness", "label": "Error handling", "body": "..." },
    { "path": "app/Services/DiscountSync.php", "line": 41, "category": "comments", "label": "Trim", "body": "...", "suggestion": { "startLine": 40, "endLine": 42, "replacement": "    /** Retried once: the vendor API drops the first call after idle. */" } }
  ]
}
```

Then run:

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/pr-comments/scripts/render-comments.mjs --format markdown < findings.json
```

The script rejects a label that is not in its category, a missing anchor, an empty body, and a `suggestion` that replaces more than six lines, whose range does not contain `line`, that sits on `Move`, `Wrong`, or `Question`, or beside a body that still carries a fenced block (backticks or tildes), naming the comment by index. It also rejects a verdict that disagrees with the severities present: `comment` beside a 🔴 or 🟠, `request_changes` with none, or `approve` with any comment at all. Fix the entry and run it again. It assigns the codes, grades the severity from the label, strips any reviewer vocabulary a body still starts with, and puts the header on its own line above the body, and renders a `suggestion` as a GitHub suggestion block after the body, widening the fence past any backticks inside the replacement. Its output is the result; do not write codes, emoji, or headers by hand, and do not reorder or edit what it prints.

## Output

The script's markdown, unchanged:

````text
Verdict: request_changes

<summary>

`app/Http/Controllers/PartnerDiscountController.php:27`
🔴 **[COR-01] Security**
`partner_id` is read from the query string and used to load the partner without checking the signed-in user owns it, so any user can change any partner's tier. Scope the lookup to the user's partners, or add a policy check before the load.

`app/Services/DiscountSync.php:52`
🟠 **[TPS-01] Unstructured array**
...

`app/Services/DiscountSync.php:41`
🟡 **[DOC-01] Trim**
The docblock repeats the method name and the retry count the code shows. Keep the one sentence that says why it retries.
```suggestion
    /** Retried once: the vendor API drops the first call after idle. */
```

Diagnostics: <text, or the line is absent>
````

With `format=json`, the script's JSON instead: each comment keeps `suggestion` as given, and its `body` already ends with the rendered suggestion block, so a poster sends `body` as-is and never builds a second block from `replacement`. A poster sets `line` to `endLine` and `side` to `RIGHT`, and sets `start_line` to `startLine` only when the two differ; a single-line suggestion omits `start_line`. With `out=`, the same content written to that path and a one-line response naming it.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Severity chosen by how bad the finding feels | Pick the label. The severity is the label's. |
| `request_changes` written because the category is correctness, or `comment` because it is not | The verdict follows the severities: 🔴 and 🟠 block in every category, 🟡 and ⚪ never do. |
| Comments grouped under severity or stage headings | One block per finding, in stage order, each standing alone. |
| The report entry quoted, then explained underneath | One body: problem, fix, code or a `suggestion`. |
| A `KEEP` with no proposed change listed as "no action needed" | Dropped. |
| `PHP-2`, `DELETE`, `both passes`, "the type-safety stage" in a body or the summary | Translated to the label; the pass and stage go nowhere. |
| A blank line between the header and the body | The script writes the header. Do not edit its output. |
| A stage absent from the report treated as clean | Named in diagnostics; the verdict is never `approve`. |
| `humanizer` listed among the skills but the bodies rendered without it, or not listed and diagnostics silent about it | Listed: run it on every body and the summary before the script. Not listed: one sentence in diagnostics says so. |
| A `suggestion` on a `Move`, `Wrong`, or `Question`, or for a fix that also needs a change elsewhere | Prose. A suggestion is applied with one click, so it must fix the finding entirely. |
| A fenced block in the body beside a `suggestion` | Drop the fenced block. The suggestion is the code. |
