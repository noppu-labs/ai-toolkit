import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LoadedSkill,
  loadSkills,
  makeSkillReferencePattern,
  parseSkillFile,
  rewriteSkillContent,
} from "../review/opencode/load-skills.ts";

const PACKAGE_ROOT: string = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "review",
);

const IDS: ReadonlySet<string> = new Set(["pr-review", "comment-audit"]);

function rewrite(body: string, packageRoot: string = "/opt/pkg"): string {
  return rewriteSkillContent(body, { packageRoot, ids: IDS });
}

function makeSkillMarkdown(name: string, marker: string): string {
  return `---\nname: ${name}\ndescription: Use when ${marker}\n---\n\n# ${marker}\n`;
}

describe("parseSkillFile", () => {
  const markdown: string =
    "---\nname: x\ndescription: Use when: a, b\n---\n\nBody\n";
  const expected: { name: string; description: string; body: string } = {
    name: "x",
    description: "Use when: a, b",
    body: "Body\n",
  };

  it("parses LF input", () => {
    expect(parseSkillFile(markdown)).toEqual(expected);
  });

  it("parses CRLF input", () => {
    expect(parseSkillFile(markdown.replaceAll("\n", "\r\n"))).toEqual(expected);
  });

  it("unquotes double-quoted values", () => {
    const parsed = parseSkillFile(
      '---\nname: "x"\ndescription: "a: b"\n---\nBody\n',
    );

    expect(parsed.name).toBe("x");
    expect(parsed.description).toBe("a: b");
  });

  it("throws without frontmatter", () => {
    expect(() => parseSkillFile("Body\n")).toThrow();
  });

  it("throws without a name", () => {
    expect(() => parseSkillFile("---\ndescription: d\n---\nB\n")).toThrow(
      /name/,
    );
  });

  it("throws without a description", () => {
    expect(() => parseSkillFile("---\nname: n\n---\nB\n")).toThrow(
      /description/,
    );
  });

  it("round-trips arbitrary simple names and bodies", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/),
        fc.stringMatching(/^[A-Za-z][A-Za-z0-9 ,]{0,20}$/),
        fc.string(),
        (name: string, description: string, body: string) => {
          const parsed = parseSkillFile(
            `---\nname: ${name}\ndescription: ${description}\n---\n${body}`,
          );

          expect(parsed.name).toBe(name);
          expect(parsed.description).toBe(description.trim());
        },
      ),
    );
  });
});

describe("rewriteSkillContent", () => {
  it("rewrites usage lines to @id", () => {
    expect(rewrite("`/review:comment-audit [--apply]`")).toBe(
      "`@comment-audit [--apply]`",
    );
  });

  it("rewrites bare names to the id", () => {
    expect(rewrite("Invoke `review:comment-audit base=1`")).toBe(
      "Invoke `comment-audit base=1`",
    );
  });

  it("leaves names that are not ids", () => {
    expect(rewrite("review:pr-review-stages")).toBe("review:pr-review-stages");
    expect(rewrite("investigate:brief")).toBe("investigate:brief");
  });

  it("substitutes the plugin root", () => {
    expect(rewrite(`bash \${CLAUDE_PLUGIN_ROOT}/skills/a/x.sh BASE`)).toBe(
      "bash /opt/pkg/skills/a/x.sh BASE",
    );
  });

  it("single-quotes the token when the root has whitespace", () => {
    expect(
      rewrite(
        `bash \${CLAUDE_PLUGIN_ROOT}/skills/a/x.sh BASE`,
        "/Users/Jane Doe/pkg",
      ),
    ).toBe("bash '/Users/Jane Doe/pkg/skills/a/x.sh' BASE");
  });

  it("escapes single quotes inside the quoted token", () => {
    expect(rewrite(`\${CLAUDE_PLUGIN_ROOT}/x`, "/it's")).toBe("'/it'\\''s/x'");
  });

  it("stops the token at a backtick", () => {
    expect(rewrite(`\`\${CLAUDE_PLUGIN_ROOT}/x\``, "/a b")).toBe("`'/a b/x'`");
  });

  it("inserts the root literally", () => {
    expect(rewrite(`\${CLAUDE_PLUGIN_ROOT}/x`, "/tmp/$&$1$$")).toBe(
      "'/tmp/$&$1$$/x'",
    );
  });

  it("keeps a markdown link target valid and unquoted", () => {
    expect(rewrite(`[x](\${CLAUDE_PLUGIN_ROOT}/a.md)`, "/a b")).toBe(
      "[x](/a b/a.md)",
    );
    expect(rewrite(`[x](\${CLAUDE_PLUGIN_ROOT}/a.md)`, "/opt/pkg")).toBe(
      "[x](/opt/pkg/a.md)",
    );
  });

  it("is idempotent", () => {
    const piece: fc.Arbitrary<string> = fc.oneof(
      fc.string(),
      fc.constantFrom(
        `\${CLAUDE_PLUGIN_ROOT}/a`,
        `(\${CLAUDE_PLUGIN_ROOT}/a)`,
        "review:comment-audit",
        "/review:pr-review",
        "review:review:comment-audit",
        "review:pr-review-stages",
        " ",
        "`",
      ),
    );

    fc.assert(
      fc.property(
        fc.array(piece, { maxLength: 8 }),
        fc.constantFrom("/opt/pkg", "/a b/pkg", "/it's"),
        (pieces: string[], root: string) => {
          const once: string = rewrite(pieces.join(""), root);

          expect(rewrite(once, root)).toBe(once);
        },
      ),
    );
  });

  it("leaves text without the token or review: untouched", () => {
    fc.assert(
      fc.property(
        fc
          .string()
          .filter(
            (text: string) =>
              !text.includes(`\${CLAUDE_PLUGIN_ROOT}`) &&
              !text.includes("review:"),
          ),
        (text: string) => {
          expect(rewrite(text)).toBe(text);
        },
      ),
    );
  });
});

describe("loadSkills", () => {
  const roots: string[] = [];

  function makeRoot(): string {
    const root: string = mkdtempSync(join(tmpdir(), "load-skills-"));

    roots.push(root);

    return root;
  }

  function writeSkill(
    root: string,
    sub: string,
    id: string,
    marker: string,
  ): string {
    const dir: string = join(root, sub, id);

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), makeSkillMarkdown(id, marker));

    return join(dir, "SKILL.md");
  }

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("loads shared skills sorted by id", () => {
    const root: string = makeRoot();
    const pathB: string = writeSkill(root, "skills", "b", "bee");
    const pathA: string = writeSkill(root, "skills", "a", "ay");
    const skills: LoadedSkill[] = loadSkills(root);

    expect(skills.map((skill: LoadedSkill) => skill.id)).toEqual(["a", "b"]);
    expect(skills[0]?.path).toBe(pathA);
    expect(skills[1]?.path).toBe(pathB);
  });

  it("names the file whose SKILL.md cannot be parsed", () => {
    const root: string = makeRoot();
    const dir: string = join(root, "skills", "broken");

    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "no frontmatter here\n");

    expect(() => loadSkills(root)).toThrow(join(dir, "SKILL.md"));
  });

  it("prefers an OpenCode override", () => {
    const root: string = makeRoot();

    writeSkill(root, "skills", "a", "shared");
    writeSkill(root, "skills", "b", "shared");

    const overridePath: string = writeSkill(
      root,
      join("opencode", "skills"),
      "a",
      "override",
    );
    const skills: LoadedSkill[] = loadSkills(root);

    expect(skills[0]?.path).toBe(overridePath);
    expect(skills[0]?.content).toContain("override");
    expect(skills[1]?.content).toContain("shared");
  });

  it("throws naming the skills directory when it is missing", () => {
    const root: string = makeRoot();

    expect(() => loadSkills(root)).toThrow(join(root, "skills"));
  });

  it("loads the real package", () => {
    const skills: LoadedSkill[] = loadSkills(PACKAGE_ROOT);
    const dirs: string[] = readdirSync(join(PACKAGE_ROOT, "skills"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const ids: ReadonlySet<string> = new Set(dirs);
    const leftover: RegExp = makeSkillReferencePattern(ids);

    expect(skills.map((skill: LoadedSkill) => skill.id)).toEqual(dirs);

    for (const skill of skills) {
      expect(skill.name).toBe(skill.id);
      expect(skill.description).not.toBe("");
      expect(skill.content).not.toContain(`\${CLAUDE_PLUGIN_ROOT}`);
      expect(skill.content.match(leftover)).toBeNull();
      expect(readFileSync(skill.path, "utf8")).not.toMatch(/^!`/m);
    }
  });
});
