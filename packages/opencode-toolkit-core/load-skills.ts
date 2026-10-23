import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeSkillId, NAMESPACES, requireNamespace } from "./naming.ts";

export type LoadedSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  content: string;
};

export type ParsedSkill = { name: string; description: string; body: string };

export type NameRewriteOptions = {
  namespace: string;
  ids: ReadonlySet<string>;
};

export type RewriteOptions = NameRewriteOptions & { packageRoot: string };

const SKILL_NAME: string = "[a-z0-9]+(?:-[a-z0-9]+)*";

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

  // Group 1 is not optional, so it is set on every match.
  const block: string = match[1] as string;
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

function makeNamePart(namespace: string, options: NameRewriteOptions): string {
  if (namespace !== options.namespace) {
    return SKILL_NAME;
  }

  return [...options.ids].map(escapeRegExp).join("|");
}

// A match that follows ":" is skipped so "review:review:x" cannot turn into
// "review:x" and then match again on a second pass. Each namespace owns two
// capture groups, the usage form and the bare form. The package's own
// namespace matches only its ids; the others match any skill-shaped name.
export function makeSkillReferencePattern(options: NameRewriteOptions): RegExp {
  if (options.ids.size === 0) {
    return /(?!)/g;
  }

  const alternatives: string[] = NAMESPACES.map((namespace: string): string => {
    const name: string = makeNamePart(namespace, options);

    return `(?<![\\w:-])/${namespace}:(${name})(?![\\w-])|(?<![\\w/:-])${namespace}:(${name})(?![\\w-])`;
  });

  return new RegExp(alternatives.join("|"), "g");
}

export function rewriteSkillNames(
  text: string,
  options: NameRewriteOptions,
): string {
  return text.replace(
    makeSkillReferencePattern(options),
    (...args: unknown[]): string => {
      const groups: (string | undefined)[] = args.slice(
        1,
        1 + NAMESPACES.length * 2,
      ) as (string | undefined)[];
      // The pattern is one alternation, so exactly one group is set on a match,
      // and its pair of groups maps to one namespace.
      const index: number = groups.findIndex(
        (group: string | undefined): boolean => group !== undefined,
      );
      const namespace: string = NAMESPACES[Math.floor(index / 2)] as string;
      const id: string = makeSkillId(namespace, groups[index] as string);

      return index % 2 === 0 ? `@${id}` : id;
    },
  );
}

function quoteShellToken(token: string): string {
  return `'${token.replaceAll("'", "'\\''")}'`;
}

function escapeDoubleQuoted(text: string): string {
  return text.replace(/[\\"$`]/g, "\\$&");
}

// The first alternative is a token right after an opening double quote: it
// runs to the closing quote, which stays outside the match.
const PLUGIN_ROOT_TOKEN: RegExp =
  /(?<=")\$\{CLAUDE_PLUGIN_ROOT\}(?:(?!\$\{CLAUDE_PLUGIN_ROOT\})[^"\n])*|\$\{CLAUDE_PLUGIN_ROOT\}(?:(?!\$\{CLAUDE_PLUGIN_ROOT\})[^\s`)])*/g;

function rewritePluginRoot(body: string, packageRoot: string): string {
  const quoteable: boolean = NEEDS_QUOTING.test(packageRoot);

  return body.replace(
    PLUGIN_ROOT_TOKEN,
    (match: string, offset: number, whole: string) => {
      const suffix: string = match.slice(ROOT_TOKEN.length);

      if (whole[offset - 1] === '"') {
        return escapeDoubleQuoted(packageRoot) + suffix;
      }

      const substituted: string = packageRoot + suffix;
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
    rewriteSkillNames(body, options),
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
    // readFileSync and parseSkillFile only throw Error instances.
    const message: string = (error as Error).message;

    throw new Error(`${path}: ${message}`, { cause: error });
  }
}

export function loadSkills(
  packageRoot: string,
  namespace: string,
): LoadedSkill[] {
  requireNamespace(namespace);

  const dirs: string[] = readSkillDirectories(join(packageRoot, "skills"));
  const options: NameRewriteOptions = { namespace, ids: new Set(dirs) };

  return dirs.map((dir: string): LoadedSkill => {
    const path: string = pickSkillPath(packageRoot, dir);
    const parsed: ParsedSkill = readSkillFile(path);
    const id: string = makeSkillId(namespace, dir);

    return {
      id,
      name: id,
      description: rewriteSkillNames(parsed.description, options),
      path,
      content: rewriteSkillContent(parsed.body, { ...options, packageRoot }),
    };
  });
}
