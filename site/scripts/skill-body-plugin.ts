import { posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineHastPlugin,
  type HastNode,
  type HastPluginEntry,
  type HastVisitorContext,
  type PluginFactoryContext,
} from "satteri";

interface Options {
  repoRoot: string;
  repoUrl: string;
}

const SKILL_FILE = /^[^/]+\/skills\/[^/]+\/SKILL\.md$/;
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const HEADING = /^h([1-6])$/;
type Element = Extract<HastNode, { type: "element" }>;

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/** The SKILL.md's path relative to the repo, with `/` separators, or `undefined` for any other file. */
function skillFileOf(
  fileURL: URL | undefined,
  repoRoot: string,
): string | undefined {
  if (fileURL === undefined) {
    return undefined;
  }

  const inRepo = relative(repoRoot, fileURLToPath(fileURL))
    .split(sep)
    .join("/");

  return SKILL_FILE.test(inRepo) ? inRepo : undefined;
}

/** `href` pointed at the file on GitHub, or `undefined` when it is already absolute, root-relative or a fragment. */
function githubHref(
  href: string,
  directory: string,
  repoUrl: string,
): string | undefined {
  if (NOT_RELATIVE.test(href)) {
    return undefined;
  }

  const hash = href.indexOf("#");
  const target = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? "" : href.slice(hash);

  return `${repoUrl}/blob/main/${posix.join(directory, target)}${fragment}`;
}

/**
 * For each skill's SKILL.md rendered on its page: relative links go to the file on GitHub, and
 * headings move down two levels because the page owns the `h1` and the section's `h2`.
 */
export function skillBodyPlugin({
  repoRoot,
  repoUrl,
}: Options): HastPluginEntry {
  return (context: PluginFactoryContext): HastPluginEntry => {
    const skillFile = skillFileOf(context.fileURL, repoRoot);

    if (skillFile === undefined) {
      return null;
    }

    const directory = posix.dirname(skillFile);

    return defineHastPlugin({
      name: "skill-body",
      element: [
        {
          filter: ["a"],
          visit: (node: Element, ctx: HastVisitorContext): void => {
            const href = node.properties.href;
            const target =
              typeof href === "string"
                ? githubHref(href, directory, repoUrl)
                : undefined;

            if (target !== undefined) {
              ctx.setProperty(node, "href", target);
            }
          },
        },
        {
          filter: HEADINGS,
          visit: (node: Element, ctx: HastVisitorContext): void => {
            const level = Number(HEADING.exec(node.tagName)?.[1]);

            ctx.replaceNode(node, {
              ...node,
              tagName: `h${Math.min(level + 2, 6)}`,
            });
          },
        },
      ],
    });
  };
}
