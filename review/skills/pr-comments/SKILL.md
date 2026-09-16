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

- A comment-audit `KEEP` that proposes no change is dropped. A `KEEP` that proposes a change is kept and labelled by what it proposes.
- A finding listed under two stages appears once, under the stage that ruled on it most precisely.
- At most 20 correctness, 20 type safety, and 40 comment findings. When a cap cuts, the least severe go first, and the cut is recorded in diagnostics.

Order: correctness, then type safety, then comments, each in the order the report gave them.

## Step 2: classify

Each entry gets a `category`, the stage it came from (`correctness`, `typeSafety`, `comments`), and a `label` copied verbatim from that category's list in the taxonomy. Translate the stage's own identifiers with the taxonomy's tables: `PHP-2` becomes `Unstructured array`, a `DELETE` verdict becomes `Delete`. Pick the closest label; never invent one. When two fit, take the more severe.

## Step 3: write the body

Every body is written for an engineer who has never heard of this review and reads the comment cold, in any order. A body is:

1. The problem, in one or two sentences, naming the symbol or line it is about.
2. The fix, concrete enough to act on: the call to make, the check to add, the type to declare.
3. When the report proposed code, that code in a fenced block.

Nothing else. The header, emoji, and code are added by the script in step 4; a body starts with the problem. The body names only the author's code: what the review could or could not run, and which stage or pass found the finding, go to diagnostics in step 5. Follow `style.md`; when a `humanizer` skill is available, apply it to each body and to the summary.

One body from the report's entry, not the report's entry quoted and then paraphrased.

## Step 4: render

Write the classified entries to a JSON file in the scratchpad:

```json
{
  "verdict": "request_changes",
  "summary": "...",
  "diagnostics": "",
  "comments": [
    { "path": "app/Services/DiscountSync.php", "line": 88, "category": "correctness", "label": "Error handling", "body": "..." }
  ]
}
```

Then run:

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/pr-comments/scripts/render-comments.mjs --format markdown < findings.json
```

The script rejects a label that is not in its category, a missing anchor, or an empty body, naming the comment by index. Fix the entry and run it again. It assigns the codes, grades the severity from the label, strips any reviewer vocabulary a body still starts with, and puts the header on its own line above the body. Its output is the result; do not write codes, emoji, or headers by hand, and do not reorder or edit what it prints.

## Step 5: verdict, summary, diagnostics

Verdict:

- `request_changes` when any correctness finding survives.
- `comment` when only type safety or comment findings survive.
- `approve` when nothing survives and every stage reported. A stage missing from the report is never treated as clean.

Summary: two to four sentences on what the review found in the author's code, in the same voice as the bodies. No greeting, no praise, no sign-off.

Diagnostics: everything the summary may not say, for whoever runs the review rather than the author. A stage that did not report, a tool that was unavailable, a cap that cut findings, a conclusion that could not be verified. Empty when the review ran clean and complete.

## Output

The script's markdown, unchanged:

```text
Verdict: request_changes

<summary>

`app/Http/Controllers/PartnerDiscountController.php:27`
🔴 **[COR-01] Security**
`partner_id` is read from the query string and used to load the partner without checking the signed-in user owns it, so any user can change any partner's tier. Scope the lookup to the user's partners, or add a policy check before the load.

`app/Services/DiscountSync.php:52`
🟠 **[TPS-01] Unstructured array**
...

Diagnostics: <text, or the line is absent>
```

With `format=json`, the script's JSON instead. With `out=`, the same content written to that path and a one-line response naming it.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Severity chosen by how bad the finding feels | Pick the label. The severity is the label's. |
| Comments grouped under severity or stage headings | One block per finding, in stage order, each standing alone. |
| The report entry quoted, then explained underneath | One body: problem, fix, code. |
| A `KEEP` with no proposed change listed as "no action needed" | Dropped. |
| `PHP-2`, `DELETE`, `both passes`, "the type-safety stage" in a body or the summary | Translated to the label; the pass and stage go nowhere. |
| A blank line between the header and the body | The script writes the header. Do not edit its output. |
| A stage absent from the report treated as clean | Named in diagnostics; the verdict is never `approve`. |
