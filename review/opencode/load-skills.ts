import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LoadedSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
};

type ParsedSkill = { name: string; description: string; body: string };

type RewriteOptions = { packageRoot: string; ids: ReadonlySet<string> };

const FRONTMATTER: RegExp = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

const ROOT_TOKEN: string = `\${CLAUDE_PLUGIN_ROOT}`;

const NEEDS_QUOTING: RegExp = /[\s'"`$\\]/;

function unquoteValue(value: string): string {
  const trimmed: string = value.trim();

  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readFrontmatterField(block: string, key: string): string {
  for (const line of block.split("\n")) {
    const separator: number = line.indexOf(":");

    if (separator > 0 && line.slice(0, separator).trim() === key) {
      return unquoteValue(line.slice(separator + 1));
    }
  }

  return "";
}

export function parseSkillFile(markdown: string): ParsedSkill {
  const match: RegExpExecArray | null = FRONTMATTER.exec(
    markdown.replaceAll("\r\n", "\n"),
  );

  if (match === null) {
    throw new Error("SKILL.md has no frontmatter block");
  }

  const block: string = match[1] ?? "";
  const name: string = readFrontmatterField(block, "name");
  const description: string = readFrontmatterField(block, "description");

  if (name === "") {
    throw new Error("SKILL.md frontmatter has no name");
  }

  if (description === "") {
    throw new Error("SKILL.md frontmatter has no description");
  }

  const rest: string = markdown
    .replaceAll("\r\n", "\n")
    .slice(match[0].length)
    .replace(/^(?:[ \t]*\n)+/, "");

  return { name, description, body: rest };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A match that follows ":" is skipped so "review:review:x" cannot turn into
// "review:x" and then match again on a second pass.
export function makeSkillReferencePattern(ids: ReadonlySet<string>): RegExp {
  const alternation: string = [...ids].map(escapeRegExp).join("|");

  if (alternation === "") {
    return /(?!)/g;
  }

  return new RegExp(
    `(?<![\\w:-])/review:(${alternation})(?![\\w-])|(?<![\\w/:-])review:(${alternation})(?![\\w-])`,
    "g",
  );
}

function rewriteSkillNames(body: string, ids: ReadonlySet<string>): string {
  return body.replace(
    makeSkillReferencePattern(ids),
    (_match: string, usage: string | undefined, name: string | undefined) =>
      usage === undefined ? (name ?? "") : `@${usage}`,
  );
}

function quoteShellToken(token: string): string {
  return `'${token.replaceAll("'", "'\\''")}'`;
}

function rewritePluginRoot(body: string, packageRoot: string): string {
  const quoteable: boolean = NEEDS_QUOTING.test(packageRoot);

  return body.replace(
    /\$\{CLAUDE_PLUGIN_ROOT\}(?:(?!\$\{CLAUDE_PLUGIN_ROOT\})[^\s`)])*/g,
    (match: string, offset: number, whole: string) => {
      const substituted: string = packageRoot + match.slice(ROOT_TOKEN.length);
      const inLink: boolean = whole[offset - 1] === "(";

      return quoteable && !inLink ? quoteShellToken(substituted) : substituted;
    },
  );
}

export function rewriteSkillContent(
  body: string,
  options: RewriteOptions,
): string {
  return rewritePluginRoot(
    rewriteSkillNames(body, options.ids),
    options.packageRoot,
  );
}

function readSkillDirectories(skillsDir: string): string[] {
  try {
    return readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((id) => existsSync(join(skillsDir, id, "SKILL.md")))
      .sort();
  } catch (error) {
    throw new Error(`Cannot read skills directory ${skillsDir}`, {
      cause: error,
    });
  }
}

function pickSkillPath(packageRoot: string, id: string): string {
  const override: string = join(
    packageRoot,
    "opencode",
    "skills",
    id,
    "SKILL.md",
  );

  return existsSync(override)
    ? override
    : join(packageRoot, "skills", id, "SKILL.md");
}

function readSkillFile(path: string): ParsedSkill {
  try {
    return parseSkillFile(readFileSync(path, "utf8"));
  } catch (error) {
    const message: string =
      error instanceof Error ? error.message : String(error);

    throw new Error(`${path}: ${message}`, { cause: error });
  }
}

export function loadSkills(packageRoot: string): LoadedSkill[] {
  const ids: string[] = readSkillDirectories(join(packageRoot, "skills"));
  const idSet: ReadonlySet<string> = new Set(ids);

  return ids.map((id: string): LoadedSkill => {
    const path: string = pickSkillPath(packageRoot, id);
    const parsed: ParsedSkill = readSkillFile(path);

    return {
      id,
      name: parsed.name,
      description: parsed.description,
      path,
      content: rewriteSkillContent(parsed.body, { packageRoot, ids: idSet }),
    };
  });
}
