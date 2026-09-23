import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Category = "correctness" | "typeSafety" | "comments";

type InputComment = {
  path: string;
  line: number;
  body: string;
  category: Category;
  label: string;
};

type RenderedComment = InputComment & { code: string };

type RenderedInput = Record<string, unknown> & { comments: RenderedComment[] };

type RenderModule = {
  LABELS: Record<Category, string[]>;
  VERDICTS: string[];
  formatMarkdown: (rendered: RenderedInput) => string;
  renderComments: (input: unknown) => RenderedInput;
  scrubBody: (body: string) => string;
};

const scriptPath: string = join(
  import.meta.dirname,
  "..",
  "review",
  "skills",
  "pr-comments",
  "scripts",
  "render-comments.mjs",
);

// The script is plain ESM outside tsconfig's `include`, so a static import
// would resolve to an untyped module. A computed specifier keeps the contract
// declared here and the runtime behaviour under test.
const mod: RenderModule = (await import(
  pathToFileURL(scriptPath).href
)) as RenderModule;

const LABELS: Record<Category, string[]> = mod.LABELS;
const scrubBody: RenderModule["scrubBody"] = mod.scrubBody;
const renderComments: RenderModule["renderComments"] = mod.renderComments;
const formatMarkdown: RenderModule["formatMarkdown"] = mod.formatMarkdown;

const PREFIXES: Record<Category, string> = {
  correctness: "COR",
  typeSafety: "TPS",
  comments: "DOC",
};

const HEADER =
  /^\p{Extended_Pictographic} \*\*\[(COR|TPS|DOC)-\d{2,}\] [^\n]+\*\*\n(?!\n)/u;

function makeComment(overrides: Partial<InputComment> = {}): InputComment {
  return {
    path: "app/Thing.php",
    line: 31,
    body: "Body text.",
    category: "correctness",
    label: "Bug",
    ...overrides,
  };
}

function makeCommentArb(): fc.Arbitrary<InputComment> {
  const byCategory = Object.entries(LABELS).map(([category, labels]) =>
    fc.record({
      path: fc.string({ minLength: 1 }),
      line: fc.integer({ min: 1, max: 9999 }),
      body: fc.string({ minLength: 1 }).filter((text) => text.trim() !== ""),
      category: fc.constant(category as Category),
      label: fc.constantFrom(...labels),
    }),
  );

  return fc.oneof(...byCategory);
}

function makeCommentListArb(max = 12): fc.Arbitrary<InputComment[]> {
  return fc.array(makeCommentArb(), { maxLength: max });
}

function makeExpectedCodes(comments: InputComment[]): string[] {
  const counters = new Map<string, number>();

  return comments.map((comment) => {
    const prefix = PREFIXES[comment.category];
    const next = (counters.get(prefix) ?? 0) + 1;

    counters.set(prefix, next);

    return `${prefix}-${String(next).padStart(2, "0")}`;
  });
}

function getFirst(rendered: RenderedInput): RenderedComment {
  const [comment] = rendered.comments;

  if (comment === undefined) {
    throw new Error("expected at least one rendered comment");
  }

  return comment;
}

function getError(input: unknown): string {
  try {
    renderComments(input);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error("expected renderComments to throw");
}

function runCli(
  input: string,
  ...args: string[]
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync("node", [scriptPath, ...args], {
    input,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("LABELS", () => {
  it("exposes the label vocabulary of each category", () => {
    expect(LABELS).toEqual({
      correctness: [
        "Accessibility",
        "Bug",
        "Convention",
        "Dead code",
        "Duplication",
        "Edge case",
        "Error handling",
        "Missing test",
        "Performance",
        "Question",
        "Security",
        "Separation of concerns",
        "Validation",
      ],
      typeSafety: [
        "Duplicate type",
        "Missing sanity check",
        "Mixed on a boundary",
        "Pseudo-type",
        "Unchecked cast",
        "Unstructured array",
      ],
      comments: ["Delete", "Move", "Trim", "Unsure", "Wrong"],
    });
  });
});

describe("scrubBody", () => {
  const cases: Array<{ name: string; input: string; expected: string }> = [
    {
      name: "a model-written severity header",
      input: "🔴 **[Bug] app/Thing.php:31** Real body.",
      expected: "Real body.",
    },
    {
      name: "an anchor and rule id header",
      input: "**app/Thing.php:31, PHP-2**: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bold rule id",
      input: "**TS-1**: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bare rule id",
      input: "PHP-2: Real body.",
      expected: "Real body.",
    },
    {
      name: "a parenthesised rule id",
      input: "(TS-3) Real body.",
      expected: "Real body.",
    },
    {
      name: "a bold audit verdict",
      input: "**DELETE**: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bare audit verdict",
      input: "WRONG: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bracketed pass tag",
      input: "[both passes] Real body.",
      expected: "Real body.",
    },
    {
      name: "a bare pass tag",
      input: "code-review only: Real body.",
      expected: "Real body.",
    },
  ];

  for (const scrubCase of cases) {
    it(`strips ${scrubCase.name}`, () => {
      expect(scrubBody(scrubCase.input)).toBe(scrubCase.expected);
    });
  }

  it("leaves a bracketed reference that is not a leaked header intact", () => {
    const body = "Refer **[RFC 7231]** for the exact wording of the header.";

    expect(scrubBody(body)).toBe(body);
  });

  it("leaves a rule id that is not at the start intact", () => {
    const body = "The cast flagged as TS-1: the payload is never narrowed.";

    expect(scrubBody(body)).toBe(body);
  });

  it("strips nothing from a body that already starts with the problem", () => {
    const body =
      "`sync()` swallows the client error.\n\n```php\nthrow $e;\n```";

    expect(scrubBody(body)).toBe(body);
  });

  const prefixArb: fc.Arbitrary<string> = fc.constantFrom(
    "🔴 **[Bug] app/Thing.php:31** ",
    "**app/Thing.php:31, PHP-2**: ",
    "**TS-1**: ",
    "PHP-2: ",
    "(TS-3) ",
    "**DELETE**: ",
    "WRONG: ",
    "[both passes] ",
    "code-review only: ",
  );

  const bodyArb: fc.Arbitrary<string> = fc.oneof(
    fc.string(),
    fc
      .tuple(fc.array(prefixArb, { maxLength: 3 }), fc.string())
      .map(([prefixes, rest]) => `${prefixes.join("")}${rest}`),
  );

  it("is idempotent", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const once = scrubBody(body);

        return scrubBody(once) === once;
      }),
    );
  });

  it("never adds characters", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        return scrubBody(body).length <= body.length;
      }),
    );
  });
});

describe("renderComments", () => {
  it("renders the code, the severity emoji and the label on their own line", () => {
    const rendered = renderComments({ comments: [makeComment()] });
    const comment = getFirst(rendered);

    expect(comment.code).toBe("COR-01");
    expect(comment.body).toBe("🔴 **[COR-01] Bug**\nBody text.");
  });

  it("emits the comment keys in a fixed order", () => {
    const rendered = renderComments({ comments: [makeComment()] });

    expect(Object.keys(getFirst(rendered))).toEqual([
      "path",
      "line",
      "code",
      "category",
      "label",
      "body",
    ]);
  });

  it("drops keys the model wrote that the renderer owns", () => {
    const input = {
      comments: [{ ...makeComment(), code: "COR-99", severity: "high" }],
    };

    const comment = getFirst(renderComments(input));

    expect(comment.code).toBe("COR-01");
    expect(Object.keys(comment)).not.toContain("severity");
  });

  const emojiCases: Array<{
    category: Category;
    label: string;
    emoji: string;
  }> = [
    { category: "correctness", label: "Bug", emoji: "🔴" },
    { category: "correctness", label: "Security", emoji: "🔴" },
    { category: "correctness", label: "Error handling", emoji: "🟠" },
    { category: "correctness", label: "Accessibility", emoji: "🟠" },
    { category: "correctness", label: "Edge case", emoji: "🟡" },
    { category: "correctness", label: "Dead code", emoji: "🟡" },
    { category: "correctness", label: "Duplication", emoji: "🟡" },
    { category: "correctness", label: "Convention", emoji: "🟡" },
    { category: "correctness", label: "Question", emoji: "⚪" },
    { category: "typeSafety", label: "Mixed on a boundary", emoji: "🟠" },
    { category: "typeSafety", label: "Duplicate type", emoji: "🟡" },
    { category: "comments", label: "Wrong", emoji: "🔴" },
    { category: "comments", label: "Trim", emoji: "🟡" },
    { category: "comments", label: "Unsure", emoji: "⚪" },
  ];

  for (const emojiCase of emojiCases) {
    it(`grades ${emojiCase.label} as ${emojiCase.emoji}`, () => {
      const rendered = renderComments({
        comments: [
          makeComment({
            category: emojiCase.category,
            label: emojiCase.label,
          }),
        ],
      });

      expect(getFirst(rendered).body.startsWith(`${emojiCase.emoji} **[`)).toBe(
        true,
      );
    });
  }

  it("numbers each prefix independently in input order", () => {
    const rendered = renderComments({
      comments: [
        makeComment(),
        makeComment({ category: "typeSafety", label: "Pseudo-type" }),
        makeComment({ category: "correctness", label: "Validation" }),
        makeComment({ category: "comments", label: "Trim" }),
        makeComment({ category: "typeSafety", label: "Unchecked cast" }),
      ],
    });

    expect(rendered.comments.map((comment) => comment.code)).toEqual([
      "COR-01",
      "TPS-01",
      "COR-02",
      "DOC-01",
      "TPS-02",
    ]);
  });

  it("widens the counter past two digits without colliding", () => {
    const comments = Array.from({ length: 100 }, () => makeComment());

    const codes = renderComments({ comments }).comments.map(
      (comment) => comment.code,
    );

    expect(codes[0]).toBe("COR-01");
    expect(codes[98]).toBe("COR-99");
    expect(codes[99]).toBe("COR-100");
    expect(new Set(codes).size).toBe(100);
  });

  it("strips a leaked prefix from the body it renders", () => {
    const rendered = renderComments({
      comments: [makeComment({ body: "**DELETE**: The comment repeats." })],
    });

    expect(getFirst(rendered).body).toBe(
      "🔴 **[COR-01] Bug**\nThe comment repeats.",
    );
  });

  it("never leaves a blank line between the header and the body", () => {
    const rendered = renderComments({
      comments: [makeComment({ body: "\n\nThe guard is missing." })],
    });

    expect(getFirst(rendered).body).toBe(
      "🔴 **[COR-01] Bug**\nThe guard is missing.",
    );
  });

  it("lists every problem of every comment, named by index", () => {
    const message = getError({
      comments: [
        makeComment(),
        {
          path: "",
          line: 0,
          body: "  ",
          category: "correctness",
          label: "Bug",
        },
      ],
    });

    expect(message.split("\n")).toEqual([
      "comments[1]: path must be a non-empty string",
      "comments[1]: line must be an integer of at least 1",
      "comments[1]: body must be a non-empty string",
    ]);
  });

  it("rejects an unknown category", () => {
    const message = getError({
      comments: [{ ...makeComment(), category: "style" }],
    });

    expect(message).toBe(
      "comments[0]: category must be one of correctness, typeSafety, comments",
    );
  });

  it("rejects a new correctness label used under another category", () => {
    const message = getError({
      comments: [{ ...makeComment(), category: "comments", label: "Question" }],
    });

    expect(message).toBe(
      'comments[0]: label "Question" is not one of comments: Delete, Move, Trim, Unsure, Wrong',
    );
  });

  it("rejects a comment that is not an object", () => {
    expect(getError({ comments: ["nope"] })).toBe(
      "comments[0]: must be an object",
    );
  });

  it("rejects input without a comments array", () => {
    expect(getError({ verdict: "approve" })).toContain("comments");
    expect(getError(null)).toContain("comments");
  });

  it("accepts an empty comment list", () => {
    expect(renderComments({ comments: [] }).comments).toEqual([]);
  });

  it("numbers the codes 01..n per prefix in input order", () => {
    fc.assert(
      fc.property(makeCommentListArb(), (comments) => {
        const codes = renderComments({ comments }).comments.map(
          (comment) => comment.code,
        );

        return (
          codes.join(",") === makeExpectedCodes(comments).join(",") &&
          new Set(codes).size === codes.length
        );
      }),
    );
  });

  it("renders a header followed by exactly one newline", () => {
    fc.assert(
      fc.property(makeCommentListArb(), (comments) =>
        renderComments({ comments }).comments.every((comment) =>
          HEADER.test(comment.body),
        ),
      ),
    );
  });

  const extrasArb: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
    fc.string({ minLength: 1 }).filter((key) => key !== "comments"),
    fc.jsonValue(),
  );

  it("passes other top-level keys through and leaves its argument alone", () => {
    fc.assert(
      fc.property(makeCommentListArb(), extrasArb, (comments, extras) => {
        const input = { ...extras, comments };
        const before = JSON.stringify(input);

        const rendered = renderComments(input);
        const passedThrough = Object.entries(extras).every(
          ([key, value]) =>
            JSON.stringify(rendered[key]) === JSON.stringify(value),
        );

        return passedThrough && JSON.stringify(input) === before;
      }),
    );
  });

  const mismatchArb: fc.Arbitrary<InputComment> = fc
    .tuple(
      makeCommentArb(),
      fc.constantFrom(...(Object.keys(LABELS) as Category[])),
    )
    .filter(([comment, other]) => comment.category !== other)
    .chain(([comment, other]) =>
      fc.constantFrom(...LABELS[other]).map((label) => ({ ...comment, label })),
    );

  it("rejects a label that belongs to another category, naming its index", () => {
    fc.assert(
      fc.property(
        makeCommentListArb(4),
        mismatchArb,
        fc.nat({ max: 4 }),
        (valid, mismatched, offset) => {
          const index = Math.min(offset, valid.length);
          const comments = [...valid];

          comments.splice(index, 0, mismatched);

          const message = getError({ comments });

          return (
            message.includes(`comments[${index}]: label `) &&
            message.includes(mismatched.category)
          );
        },
      ),
    );
  });
});

describe("verdict validation", () => {
  const blocking: InputComment = makeComment({ label: "Bug" });
  const deferrable: InputComment = makeComment({
    category: "correctness",
    label: "Edge case",
  });

  function acceptedVerdicts(comments: InputComment[]): string[] {
    if (comments.length === 0) {
      return ["approve", "comment"];
    }

    const rendered = renderComments({ comments });
    const hasBlocking = rendered.comments.some(
      (comment) =>
        comment.body.startsWith("🔴") || comment.body.startsWith("🟠"),
    );

    return hasBlocking ? ["request_changes"] : ["comment"];
  }

  it("exposes the three verdicts", () => {
    expect(mod.VERDICTS).toEqual(["approve", "comment", "request_changes"]);
  });

  it("accepts an absent verdict", () => {
    expect(renderComments({ comments: [blocking] }).verdict).toBeUndefined();
  });

  it("treats a null verdict as absent", () => {
    const rendered = renderComments({ verdict: null, comments: [blocking] });

    expect(rendered.verdict).toBeNull();
    expect(formatMarkdown(rendered)).not.toContain("Verdict:");
  });

  it("rejects a verdict outside the vocabulary, including other spellings", () => {
    for (const verdict of [
      "REQUEST_CHANGES",
      "request-changes",
      "approved",
      "",
    ]) {
      expect(getError({ verdict, comments: [blocking] })).toBe(
        "verdict must be one of approve, comment, request_changes",
      );
    }
  });

  it("rejects approve when any comment survives", () => {
    expect(getError({ verdict: "approve", comments: [deferrable] })).toBe(
      "verdict approve requires an empty comment list",
    );
  });

  it("accepts approve and comment over an empty list", () => {
    expect(renderComments({ verdict: "approve", comments: [] }).verdict).toBe(
      "approve",
    );
    expect(renderComments({ verdict: "comment", comments: [] }).verdict).toBe(
      "comment",
    );
  });

  it("rejects comment when a 🔴 or 🟠 label is present, naming the first one", () => {
    expect(
      getError({ verdict: "comment", comments: [deferrable, blocking] }),
    ).toBe(
      "verdict comment does not fit comments[1] (Bug, 🔴); use request_changes",
    );
  });

  it("rejects request_changes when no 🔴 or 🟠 label is present", () => {
    expect(
      getError({ verdict: "request_changes", comments: [deferrable] }),
    ).toBe(
      "verdict request_changes needs at least one 🔴 or 🟠 comment; use comment",
    );
    expect(getError({ verdict: "request_changes", comments: [] })).toBe(
      "verdict request_changes needs at least one 🔴 or 🟠 comment; use comment",
    );
  });

  it("reports label problems before verdict problems", () => {
    const message = getError({
      verdict: "approve",
      comments: [{ ...makeComment(), label: "Nit" }],
    });

    expect(message.startsWith("comments[0]: label ")).toBe(true);
    expect(message).not.toContain("verdict");
  });

  it("accepts exactly the verdicts the severities allow", () => {
    fc.assert(
      fc.property(makeCommentListArb(), (comments) => {
        const accepted = acceptedVerdicts(comments);

        for (const verdict of [...mod.VERDICTS, undefined, null]) {
          const run = (): RenderedInput =>
            renderComments({ verdict, comments });

          if (verdict == null || accepted.includes(verdict)) {
            expect(run).not.toThrow();
          } else {
            expect(run).toThrow();
          }
        }
      }),
    );
  });
});

describe("formatMarkdown", () => {
  const rendered: RenderedInput = renderComments({
    verdict: "request_changes",
    summary: "Two findings survive.",
    diagnostics: "The type safety stage did not report.",
    comments: [
      makeComment({ body: "The lookup is unscoped." }),
      makeComment({
        path: "resources/js/sync.ts",
        line: 7,
        category: "typeSafety",
        label: "Unchecked cast",
        body: "The response is cast, never validated.",
      }),
    ],
  });

  it("writes every section separated by a blank line", () => {
    expect(formatMarkdown(rendered)).toBe(
      [
        "Verdict: request_changes",
        "",
        "Two findings survive.",
        "",
        "`app/Thing.php:31`",
        "🔴 **[COR-01] Bug**",
        "The lookup is unscoped.",
        "",
        "`resources/js/sync.ts:7`",
        "🟠 **[TPS-01] Unchecked cast**",
        "The response is cast, never validated.",
        "",
        "Diagnostics: The type safety stage did not report.",
        "",
      ].join("\n"),
    );
  });

  it("omits an absent verdict and an empty summary and diagnostics", () => {
    const minimal = renderComments({
      summary: "",
      diagnostics: "",
      comments: [makeComment({ body: "The lookup is unscoped." })],
    });

    expect(formatMarkdown(minimal)).toBe(
      [
        "`app/Thing.php:31`",
        "🔴 **[COR-01] Bug**",
        "The lookup is unscoped.",
        "",
      ].join("\n"),
    );
  });

  it("ends with exactly one newline", () => {
    const markdown = formatMarkdown(rendered);

    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("render-comments.mjs", () => {
  const payload = JSON.stringify({
    verdict: "request_changes",
    summary: "One finding.",
    comments: [makeComment({ body: "PHP-2: The array has a fixed key set." })],
  });

  it("prints rendered JSON on stdout by default", () => {
    const result = runCli(payload);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      verdict: "request_changes",
      summary: "One finding.",
      comments: [
        {
          path: "app/Thing.php",
          line: 31,
          code: "COR-01",
          category: "correctness",
          label: "Bug",
          body: "🔴 **[COR-01] Bug**\nThe array has a fixed key set.",
        },
      ],
    });
  });

  it("prints the same JSON with an explicit --format json", () => {
    const result = runCli(payload, "--format", "json");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(runCli(payload).stdout);
    expect(result.stdout.endsWith("}\n")).toBe(true);
  });

  it("prints markdown with --format markdown", () => {
    const result = runCli(payload, "--format", "markdown");

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        "Verdict: request_changes",
        "",
        "One finding.",
        "",
        "`app/Thing.php:31`",
        "🔴 **[COR-01] Bug**",
        "The array has a fixed key set.",
        "",
      ].join("\n"),
    );
  });

  it("exits 1 and names the offending comment on stderr", () => {
    const result = runCli(
      JSON.stringify({ comments: [{ ...makeComment(), label: "Nope" }] }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("comments[0]:");
    expect(result.stdout).toBe("");
  });

  it("exits 1 on input that is not JSON", () => {
    const result = runCli("not json");

    expect(result.status).toBe(1);
    expect(result.stderr).not.toBe("");
  });

  it("exits 2 with a usage line on an unknown format", () => {
    const result = runCli(payload, "--format", "html");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage:");
  });
});
