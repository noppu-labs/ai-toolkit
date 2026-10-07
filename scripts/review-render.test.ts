import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

type Category = "correctness" | "typeSafety" | "comments";

type Suggestion = { startLine: number; endLine: number; replacement: string };

type InputComment = {
  path: string;
  line: number;
  body: string;
  category: Category;
  label: string;
  suggestion?: Suggestion | null;
};

type Side = "RIGHT";

type RenderedComment = InputComment & {
  code: string;
  suggestion?: Suggestion;
  side?: Side;
  start_line?: number;
  start_side?: Side;
  anchor?: number;
};

type RenderedInput = Record<string, unknown> & { comments: RenderedComment[] };

type RenderModule = {
  LABELS: Record<Category, string[]>;
  SCRUB_PATTERNS: RegExp[];
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

const EMOJI_BY_LABEL: Record<string, string> = {
  Bug: "🔴",
  Security: "🔴",
  Accessibility: "🟠",
  "Error handling": "🟠",
  "Missing test": "🟠",
  Performance: "🟠",
  "Separation of concerns": "🟠",
  Validation: "🟠",
  Convention: "🟡",
  "Dead code": "🟡",
  Duplication: "🟡",
  "Edge case": "🟡",
  Question: "⚪",
  "Mixed on a boundary": "🟠",
  "Unchecked cast": "🟠",
  "Unstructured array": "🟠",
  "Duplicate type": "🟡",
  "Missing sanity check": "🟡",
  "Pseudo-type": "🟡",
  Delete: "🟡",
  Move: "🟡",
  Trim: "🟡",
  Unsure: "⚪",
  Wrong: "🔴",
};

const HEADER =
  /^\p{Extended_Pictographic} \*\*\[(COR|TPS|DOC)-\d{2,}\] [^\n]+\*\*\n(?!\n)/u;

// Key order is part of the output contract: it stays fixed across script
// versions, so a diff of two renders shows only real changes.
const PLAIN_KEYS: string[] = [
  "path",
  "line",
  "code",
  "category",
  "label",
  "body",
];

const SINGLE_LINE_KEYS: string[] = [
  "path",
  "line",
  "side",
  "anchor",
  "code",
  "category",
  "label",
  "body",
  "suggestion",
];

const MULTI_LINE_KEYS: string[] = [
  "path",
  "line",
  "side",
  "start_line",
  "start_side",
  "anchor",
  "code",
  "category",
  "label",
  "body",
  "suggestion",
];

// Mirrors NO_SUGGESTION_LABELS in render-comments.mjs, which does not export it.
const NO_SUGGESTION_LABELS: Set<string> = new Set([
  "Move",
  "Wrong",
  "Question",
  "Unsure",
]);

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
      body: fc
        .string({ minLength: 1 })
        .filter((text) => scrubBody(text).trim() !== ""),
      category: fc.constant(category as Category),
      label: fc.constantFrom(...labels),
    }),
  );

  return fc.oneof(...byCategory);
}

function makeCommentListArb(max = 12): fc.Arbitrary<InputComment[]> {
  return fc.array(makeCommentArb(), { maxLength: max });
}

// A valid suggestion around the anchor: at most six lines, containing `line`,
// on a label that allows one, with a body no fence check can reject.
function makeSuggestedCommentArb(): fc.Arbitrary<InputComment> {
  return fc
    .tuple(
      makeCommentArb().filter(
        (comment) => !NO_SUGGESTION_LABELS.has(comment.label),
      ),
      fc.integer({ min: 1, max: 9999 }),
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.string().filter((text) => !text.endsWith("\n")),
    )
    .map(([comment, anchor, before, after, replacement]) => {
      const startLine = Math.max(1, anchor - before);
      const endLine = Math.min(anchor + after, startLine + 5);

      return {
        ...comment,
        line: anchor,
        body: "Body text.",
        suggestion: { startLine, endLine, replacement },
      };
    });
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

function getRangeText(suggestion: Suggestion): string {
  return suggestion.startLine < suggestion.endLine
    ? `${suggestion.startLine}-${suggestion.endLine}`
    : `${suggestion.endLine}`;
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
      name: "an anchor and Python rule id header",
      input: "**app/totals.py:12, PY-2**: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bold Python rule id",
      input: "**PY-2**: Real body.",
      expected: "Real body.",
    },
    {
      name: "a bare Python rule id",
      input: "PY-1: Real body.",
      expected: "Real body.",
    },
    {
      name: "a parenthesised Python rule id",
      input: "(PY-3) Real body.",
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

  it("leaves a Python rule id that is not at the start intact", () => {
    const body = "The dict flagged as PY-2: callers read three fixed keys.";

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
    "**app/totals.py:12, PY-2**: ",
    "**PY-2**: ",
    "PY-1: ",
    "(PY-3) ",
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

        expect(scrubBody(once)).toBe(once);
      }),
    );
  });

  it("never adds characters", () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        expect(scrubBody(body).length).toBeLessThanOrEqual(body.length);
      }),
    );
  });

  it.each([
    [
      "a newline after the bracket",
      "🔴 **[Bug]\napp/Thing.php:31** Real body.",
    ],
    [
      "spaces around that newline",
      "🔴 **[Bug]  \n  app/Thing.php:31** Real body.",
    ],
    ["only spaces before the closing bold", "🔴 **[Bug]   ** Real body."],
    ["nothing before the closing bold", "🔴 **[Bug]** Real body."],
  ])("strips a severity header with %s", (_name, body) => {
    expect(scrubBody(body)).toBe("Real body.");
  });
});

describe("severity header pattern", () => {
  // The header pattern before the S8786 rewrite, which backtracked
  // quadratically on whitespace after `]`.
  const OLD_HEADER_RE =
    /^\p{Extended_Pictographic}\s+\*\*\[[^\]\n]*\]\s*[^*\n]*\*\*\s*/u;
  const headerRe: RegExp = mod.SCRUB_PATTERNS[0] as RegExp;

  const whitespace: fc.Arbitrary<string> = fc.constantFrom(
    " ",
    "\t",
    "\n",
    "\r",
    "\v",
    "\f",
    "\u{a0}",
    "\u{feff}",
    "\u{1680}",
    "\u{2000}",
    "\u{2028}",
    "\u{2029}",
    "\u{202f}",
    "\u{3000}",
  );
  const spaces: fc.Arbitrary<string> = fc.string({
    unit: whitespace,
    maxLength: 4,
  });
  const separators: fc.Arbitrary<string> = fc.oneof(
    fc.constantFrom("", " ", "\t", "\n", "  \n  "),
    fc.string({
      unit: fc.oneof(whitespace, fc.constant("\n")),
      maxLength: 4,
    }),
  );
  const makeText = (extra: string[]): fc.Arbitrary<string> =>
    fc.string({
      unit: fc.oneof(whitespace, fc.constantFrom("a", ":", ".", "]", ...extra)),
      maxLength: 8,
    });
  const headers: fc.Arbitrary<string> = fc
    .tuple(
      fc.constantFrom("🔴", "🟠", "🟡", "⚪", "x"),
      spaces,
      makeText(["["]),
      separators,
      makeText([]),
      fc.constantFrom("**", "*", ""),
      spaces,
      fc.string(),
    )
    .map(
      ([emoji, gap, label, separator, free, close, trailing, tail]) =>
        `${emoji}${gap}**[${label}]${separator}${free}${close}${trailing}${tail}`,
    );

  it("strips what the pre-S8786 pattern stripped", () => {
    fc.assert(
      fc.property(
        fc.oneof({ arbitrary: headers, weight: 4 }, fc.string()),
        (body) => {
          expect(body.replace(headerRe, "")).toBe(
            body.replace(OLD_HEADER_RE, ""),
          );
        },
      ),
    );
  });
});

describe("suggestions", () => {
  const trim: InputComment = makeComment({
    path: "app/Sync.php",
    line: 31,
    category: "comments",
    label: "Trim",
    body: "The docblock repeats the method name. Keep the one sentence on the retry window.",
    suggestion: {
      startLine: 30,
      endLine: 32,
      replacement:
        "// Retried once because the vendor API drops the first call after idle.",
    },
  });

  it("renders the suggestion block after the body and carries the field through", () => {
    const comment = getFirst(renderComments({ comments: [trim] }));

    expect(comment.body).toBe(
      [
        "🟡 **[DOC-01] Trim**",
        "The docblock repeats the method name. Keep the one sentence on the retry window.",
        "```suggestion",
        "// Retried once because the vendor API drops the first call after idle.",
        "```",
      ].join("\n"),
    );
    expect(comment.suggestion).toEqual(trim.suggestion);
    expect(Object.keys(comment)).toEqual(MULTI_LINE_KEYS);
  });

  it("moves line to the end of the range and keeps the finding's line as anchor", () => {
    const comment = getFirst(renderComments({ comments: [trim] }));

    expect(comment.line).toBe(32);
    expect(comment.side).toBe("RIGHT");
    expect(comment.start_line).toBe(30);
    expect(comment.start_side).toBe("RIGHT");
    expect(comment.anchor).toBe(31);
  });

  it("emits no start_line or start_side for a single-line suggestion", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            line: 31,
            suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
          }),
        ],
      }),
    );

    expect(Object.keys(comment)).toEqual(SINGLE_LINE_KEYS);
    expect(comment.line).toBe(31);
    expect(comment.side).toBe("RIGHT");
    expect(comment.anchor).toBe(31);
    expect(comment).not.toHaveProperty("start_line");
    expect(comment).not.toHaveProperty("start_side");
  });

  it("keeps anchor at the end of the range when the finding sits there", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            line: 32,
            suggestion: { startLine: 30, endLine: 32, replacement: "x" },
          }),
        ],
      }),
    );

    expect(comment.line).toBe(32);
    expect(comment.anchor).toBe(32);
    expect(comment.start_line).toBe(30);
  });

  it("drops API fields the model wrote and sets its own", () => {
    const plain = getFirst(
      renderComments({
        comments: [
          { ...makeComment(), side: "LEFT", start_line: 1, anchor: 999 },
        ],
      }),
    );
    const suggested = getFirst(
      renderComments({
        comments: [
          {
            ...makeComment({
              line: 31,
              suggestion: { startLine: 30, endLine: 31, replacement: "x" },
            }),
            side: "LEFT",
            start_line: 1,
            start_side: "LEFT",
            anchor: 999,
          },
        ],
      }),
    );

    expect(Object.keys(plain)).toEqual(PLAIN_KEYS);
    expect(suggested.side).toBe("RIGHT");
    expect(suggested.start_line).toBe(30);
    expect(suggested.start_side).toBe("RIGHT");
    expect(suggested.anchor).toBe(31);
  });

  it("renders a multi-line replacement with every line inside one block", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            line: 10,
            label: "Bug",
            body: "The guard reads the wrong key. Read `partner_id` from the route.",
            suggestion: {
              startLine: 9,
              endLine: 11,
              replacement:
                "$partner = $request->route('partner');\nabort_unless($partner, 404);\n$tier = $partner->tier;",
            },
          }),
        ],
      }),
    );

    expect(
      comment.body.endsWith(
        "```suggestion\n$partner = $request->route('partner');\nabort_unless($partner, 404);\n$tier = $partner->tier;\n```",
      ),
    ).toBe(true);
  });

  it("renders an empty replacement as an empty block", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            category: "comments",
            label: "Delete",
            body: "The comment restates the next line. Delete it.",
            suggestion: { startLine: 31, endLine: 31, replacement: "" },
          }),
        ],
      }),
    );

    expect(comment.body).toBe(
      "🟡 **[DOC-01] Delete**\nThe comment restates the next line. Delete it.\n```suggestion\n```",
    );
  });

  it("accepts six lines and rejects seven, naming the index and the count", () => {
    const six = makeComment({
      line: 31,
      suggestion: { startLine: 31, endLine: 36, replacement: "x" },
    });
    const seven = makeComment({
      line: 31,
      suggestion: { startLine: 31, endLine: 37, replacement: "x" },
    });

    expect(renderComments({ comments: [six] }).comments).toHaveLength(1);
    expect(getError({ comments: [makeComment(), seven] })).toBe(
      "comments[1]: suggestion replaces 7 lines (31 to 37); at most six",
    );
  });

  it("rejects a range that does not contain the anchor line", () => {
    const outside = makeComment({
      line: 31,
      suggestion: { startLine: 40, endLine: 42, replacement: "x" },
    });

    expect(getError({ comments: [outside] })).toBe(
      "comments[0]: suggestion range 40 to 42 does not contain line 31",
    );
  });

  it("accepts the anchor on either end of the range", () => {
    const atStart = makeComment({
      line: 30,
      suggestion: { startLine: 30, endLine: 32, replacement: "x" },
    });
    const atEnd = makeComment({
      line: 32,
      suggestion: { startLine: 30, endLine: 32, replacement: "x" },
    });

    expect(
      renderComments({ comments: [atStart, atEnd] }).comments,
    ).toHaveLength(2);
  });

  it("rejects a malformed suggestion with one line per problem", () => {
    expect(
      getError({
        comments: [{ ...makeComment(), suggestion: "x" }],
      }),
    ).toBe(
      "comments[0]: suggestion must be an object with startLine, endLine, and replacement",
    );
    expect(
      getError({
        comments: [
          {
            ...makeComment(),
            suggestion: { startLine: 0, endLine: 0, replacement: 1 },
          },
        ],
      }),
    ).toBe(
      [
        "comments[0]: suggestion.startLine must be an integer of at least 1",
        "comments[0]: suggestion.endLine must be an integer of at least 1",
        "comments[0]: suggestion.replacement must be a string; empty deletes the lines",
      ].join("\n"),
    );
    expect(
      getError({
        comments: [
          {
            ...makeComment(),
            suggestion: { startLine: 0, endLine: "x", replacement: "x" },
          },
        ],
      }),
    ).toBe(
      [
        "comments[0]: suggestion.startLine must be an integer of at least 1",
        "comments[0]: suggestion.endLine must be an integer of at least 1",
      ].join("\n"),
    );
    expect(
      getError({
        comments: [
          makeComment({
            line: 31,
            suggestion: { startLine: 32, endLine: 31, replacement: "x" },
          }),
        ],
      }),
    ).toBe(
      "comments[0]: suggestion.endLine must be an integer of at least startLine",
    );
  });

  it("rejects a replacement that ends with a newline", () => {
    const trailing = makeComment({
      suggestion: { startLine: 31, endLine: 31, replacement: "x\n" },
    });

    expect(getError({ comments: [trailing] })).toBe(
      "comments[0]: suggestion.replacement must not end with a newline; join lines with \\n",
    );
  });

  it("rejects a suggestion on Move, Wrong, Question, and Unsure", () => {
    const cases: Array<[Category, string]> = [
      ["comments", "Move"],
      ["comments", "Wrong"],
      ["correctness", "Question"],
      ["comments", "Unsure"],
    ];

    for (const [category, label] of cases) {
      const comment = makeComment({
        category,
        label,
        suggestion: { startLine: 31, endLine: 31, replacement: "x" },
      });

      expect(getError({ comments: [comment] })).toBe(
        `comments[0]: suggestion is not allowed on label ${JSON.stringify(label)}; write the fix as prose`,
      );
    }
  });

  it("rejects a body that carries a fenced block beside a suggestion", () => {
    const doubled = makeComment({
      body: "Use the route.\n```php\n$x = 1;\n```",
      suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
    });

    expect(getError({ comments: [doubled] })).toBe(
      "comments[0]: body must not carry a fenced code block when suggestion is present; the suggestion is the code",
    );
  });

  it("rejects a tilde fence or a fence indented up to three spaces beside a suggestion", () => {
    const bodies: string[] = [
      "Use the route.\n~~~php\n$x = 1;",
      "Use the route.\n   ```php\n$x = 1;",
      "Use the route.\n  ~~~~\n$x = 1;",
    ];

    for (const body of bodies) {
      const doubled = makeComment({
        body,
        suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
      });

      expect(getError({ comments: [doubled] })).toBe(
        "comments[0]: body must not carry a fenced code block when suggestion is present; the suggestion is the code",
      );
    }
  });

  it("rejects a fence that only opens a line once the body is scrubbed", () => {
    const doubled = makeComment({
      category: "comments",
      label: "Trim",
      body: "TRIM: ~~~php\n$x = 1;",
      suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
    });

    expect(getError({ comments: [doubled] })).toBe(
      "comments[0]: body must not carry a fenced code block when suggestion is present; the suggestion is the code",
    );
  });

  it("accepts inline backticks and a fence indented four spaces beside a suggestion", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            body: "Read `partner_id` from the route, not ```the query```.\n    ```",
            suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
          }),
        ],
      }),
    );

    expect(comment.body).toBe(
      "🔴 **[COR-01] Bug**\nRead `partner_id` from the route, not ```the query```.\n    ```\n```suggestion\n$x = 1;\n```",
    );
  });

  it("puts the suggestion block on the line after the body's last non-blank text", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            body: "Fix it.  \n\n",
            suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
          }),
        ],
      }),
    );

    expect(comment.body).toBe(
      "🔴 **[COR-01] Bug**\nFix it.\n```suggestion\n$x = 1;\n```",
    );
  });

  it("rejects a body that is only reviewer vocabulary, with or without a suggestion", () => {
    const bare = makeComment({
      category: "comments",
      label: "Trim",
      body: "TRIM:",
    });
    const suggested = makeComment({
      category: "comments",
      label: "Trim",
      body: "**TRIM**",
      suggestion: { startLine: 31, endLine: 31, replacement: "x" },
    });

    expect(getError({ comments: [bare, suggested] }).split("\n")).toEqual([
      "comments[0]: body is empty once reviewer vocabulary is stripped",
      "comments[1]: body is empty once reviewer vocabulary is stripped",
    ]);
  });

  it("lists suggestion problems after field and label problems of the same comment", () => {
    const comment = makeComment({
      body: "",
      label: "Nope",
      suggestion: { startLine: 40, endLine: 41, replacement: "x" },
    });

    expect(getError({ comments: [comment] }).split("\n")).toEqual([
      "comments[0]: body must be a non-empty string",
      `comments[0]: label "Nope" is not one of correctness: ${LABELS.correctness.join(", ")}`,
      "comments[0]: suggestion range 40 to 41 does not contain line 31",
    ]);
  });

  it("widens the fence past the longest backtick run in the replacement", () => {
    const three = getFirst(
      renderComments({
        comments: [
          makeComment({
            category: "comments",
            label: "Trim",
            suggestion: {
              startLine: 31,
              endLine: 33,
              replacement: "Example:\n```sh\nnpm test\n```",
            },
          }),
        ],
      }),
    );
    const four = getFirst(
      renderComments({
        comments: [
          makeComment({
            category: "comments",
            label: "Trim",
            suggestion: {
              startLine: 31,
              endLine: 33,
              replacement: "````markdown\n```\n````",
            },
          }),
        ],
      }),
    );

    expect(
      three.body.endsWith(
        "\n````suggestion\nExample:\n```sh\nnpm test\n```\n````",
      ),
    ).toBe(true);
    expect(
      four.body.endsWith("\n`````suggestion\n````markdown\n```\n````\n`````"),
    ).toBe(true);
  });

  it("never scrubs or trims the replacement", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            suggestion: {
              startLine: 31,
              endLine: 31,
              replacement: "  DELETE: \t keep me  ",
            },
          }),
        ],
      }),
    );

    expect(comment.suggestion?.replacement).toBe("  DELETE: \t keep me  ");
    expect(
      comment.body.endsWith("```suggestion\n  DELETE: \t keep me  \n```"),
    ).toBe(true);
  });

  it("carries a CRLF replacement through unchanged", () => {
    const comment = getFirst(
      renderComments({
        comments: [
          makeComment({
            suggestion: { startLine: 31, endLine: 32, replacement: "a\r\nb" },
          }),
        ],
      }),
    );

    expect(comment.suggestion?.replacement).toBe("a\r\nb");
  });

  it("treats a null suggestion as absent", () => {
    const comment = getFirst(
      renderComments({ comments: [makeComment({ suggestion: null })] }),
    );

    expect(comment).not.toHaveProperty("suggestion");
    expect(Object.keys(comment)).toEqual(PLAIN_KEYS);
    expect(comment.body).toBe("🔴 **[COR-01] Bug**\nBody text.");
  });

  it("renders a comment without a suggestion exactly as before", () => {
    fc.assert(
      fc.property(makeCommentListArb(), (comments) => {
        const rendered = renderComments({ comments });
        const markdown = formatMarkdown(rendered);

        for (const [index, comment] of rendered.comments.entries()) {
          const input = comments[index];

          if (input === undefined) {
            throw new Error("rendered more comments than given");
          }

          expect(comment).not.toHaveProperty("suggestion");
          expect(Object.keys(comment)).toEqual(PLAIN_KEYS);
          expect(comment.line).toBe(input.line);
          expect(comment.body).toBe(
            `${EMOJI_BY_LABEL[comment.label]} **[${comment.code}] ${comment.label}**\n${scrubBody(input.body)}`,
          );
          expect(markdown).toContain(
            `\`${input.path}:${input.line}\`\n${comment.body}`,
          );
        }
      }),
    );
  });

  it("posts every suggestion over its range and keeps the finding's line as anchor", () => {
    fc.assert(
      fc.property(makeSuggestedCommentArb(), (input) => {
        const comment = getFirst(renderComments({ comments: [input] }));
        const suggestion = input.suggestion;

        if (suggestion == null) {
          throw new Error("the arbitrary always carries a suggestion");
        }

        const multi = suggestion.startLine < suggestion.endLine;

        expect(comment.line).toBe(suggestion.endLine);
        expect(comment.side).toBe("RIGHT");
        expect(comment.anchor).toBe(input.line);
        expect(comment.suggestion).toEqual(suggestion);
        expect(Object.keys(comment)).toEqual(
          multi ? MULTI_LINE_KEYS : SINGLE_LINE_KEYS,
        );

        if (multi) {
          expect(comment.start_line).toBe(suggestion.startLine);
          expect(comment.start_side).toBe("RIGHT");
        }

        expect(
          formatMarkdown({ comments: [comment] }).startsWith(
            `\`${input.path}:${getRangeText(suggestion)}\`\n`,
          ),
        ).toBe(true);
      }),
    );
  });

  it("renders any replacement inside a fence longer than its longest backtick run", () => {
    fc.assert(
      fc.property(
        fc.string().filter((text) => !text.endsWith("\n")),
        (replacement) => {
          const comment = getFirst(
            renderComments({
              comments: [
                makeComment({
                  suggestion: { startLine: 31, endLine: 31, replacement },
                }),
              ],
            }),
          );
          const block = comment.body.slice(
            "🔴 **[COR-01] Bug**\nBody text.\n".length,
          );
          const fence = block.slice(0, block.indexOf("suggestion"));
          const longest = Math.max(
            0,
            ...(replacement.match(/`+/gu) ?? []).map((run) => run.length),
          );

          expect(fence.length).toBeGreaterThanOrEqual(3);
          expect(fence.length).toBeGreaterThan(longest);
          expect(block).toBe(
            `${fence}suggestion\n${replacement === "" ? "" : `${replacement}\n`}${fence}`,
          );
        },
      ),
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

  it("has an emoji for every label and no other", () => {
    expect(Object.keys(EMOJI_BY_LABEL).toSorted()).toEqual(
      Object.values(LABELS).flat().toSorted(),
    );
  });

  const emojiCases = Object.entries(LABELS).flatMap(([category, labels]) =>
    labels.map((label) => ({
      category: category as Category,
      label,
      emoji: EMOJI_BY_LABEL[label],
    })),
  );

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

        expect(codes.join(",")).toBe(makeExpectedCodes(comments).join(","));
        expect(new Set(codes).size).toBe(codes.length);
      }),
    );
  });

  it("renders a header followed by exactly one newline", () => {
    fc.assert(
      fc.property(makeCommentListArb(), (comments) => {
        for (const comment of renderComments({ comments }).comments) {
          expect(comment.body).toMatch(HEADER);
        }
      }),
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

        for (const [key, value] of Object.entries(extras)) {
          expect(JSON.stringify(rendered[key])).toBe(JSON.stringify(value));
        }
        expect(JSON.stringify(input)).toBe(before);
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

          expect(message).toContain(`comments[${index}]: label `);
          expect(message).toContain(mismatched.category);
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

  it("prints the range for a multi-line suggestion and the line otherwise", () => {
    const multi = renderComments({
      comments: [
        makeComment({
          line: 31,
          category: "comments",
          label: "Trim",
          body: "Keep the sentence that says why.",
          suggestion: { startLine: 30, endLine: 32, replacement: "// why" },
        }),
      ],
    });
    const single = renderComments({
      comments: [
        makeComment({
          line: 31,
          suggestion: { startLine: 31, endLine: 31, replacement: "$x = 1;" },
        }),
      ],
    });

    expect(formatMarkdown(multi)).toBe(
      [
        "`app/Thing.php:30-32`",
        "🟡 **[DOC-01] Trim**",
        "Keep the sentence that says why.",
        "```suggestion",
        "// why",
        "```",
        "",
      ].join("\n"),
    );
    expect(formatMarkdown(single)).toBe(
      [
        "`app/Thing.php:31`",
        "🔴 **[COR-01] Bug**",
        "Body text.",
        "```suggestion",
        "$x = 1;",
        "```",
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

  it("prints the suggestion block in markdown and the API fields in JSON", () => {
    const single = JSON.stringify({
      comments: [
        makeComment({
          category: "comments",
          label: "Delete",
          body: "Restates the guard. Delete it.",
          suggestion: { startLine: 31, endLine: 31, replacement: "" },
        }),
      ],
    });
    const multi = JSON.stringify({
      comments: [
        makeComment({
          category: "comments",
          label: "Trim",
          body: "Keep the why.",
          suggestion: { startLine: 30, endLine: 32, replacement: "// why" },
        }),
      ],
    });
    const singleMarkdown = runCli(single, "--format", "markdown");
    const multiMarkdown = runCli(multi, "--format", "markdown");

    expect(singleMarkdown.status).toBe(0);
    expect(singleMarkdown.stdout).toBe(
      "`app/Thing.php:31`\n🟡 **[DOC-01] Delete**\nRestates the guard. Delete it.\n```suggestion\n```\n",
    );
    expect(multiMarkdown.stdout).toBe(
      "`app/Thing.php:30-32`\n🟡 **[DOC-01] Trim**\nKeep the why.\n```suggestion\n// why\n```\n",
    );
    expect(JSON.parse(runCli(single).stdout).comments[0]).toEqual({
      path: "app/Thing.php",
      line: 31,
      side: "RIGHT",
      anchor: 31,
      code: "DOC-01",
      category: "comments",
      label: "Delete",
      body: "🟡 **[DOC-01] Delete**\nRestates the guard. Delete it.\n```suggestion\n```",
      suggestion: { startLine: 31, endLine: 31, replacement: "" },
    });
    expect(JSON.parse(runCli(multi).stdout).comments[0]).toEqual({
      path: "app/Thing.php",
      line: 32,
      side: "RIGHT",
      start_line: 30,
      start_side: "RIGHT",
      anchor: 31,
      code: "DOC-01",
      category: "comments",
      label: "Trim",
      body: "🟡 **[DOC-01] Trim**\nKeep the why.\n```suggestion\n// why\n```",
      suggestion: { startLine: 30, endLine: 32, replacement: "// why" },
    });
  });
});
