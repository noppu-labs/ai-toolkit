import { posix, relative, sep } from "node:path";
import type { Element, Root, RootContent } from "hast";
import type { VFile } from "vfile";

interface Options {
  repoRoot: string;
  repoUrl: string;
}

const SKILL_FILE = /^[^/]+\/skills\/[^/]+\/SKILL\.md$/;
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const HEADING = /^h([1-6])$/;

/** The SKILL.md's path relative to the repo, with `/` separators, or `undefined` for any other file. */
function skillFileOf(
  path: string | undefined,
  repoRoot: string,
): string | undefined {
  if (path === undefined) {
    return undefined;
  }

  const inRepo = relative(repoRoot, path).split(sep).join("/");

  return SKILL_FILE.test(inRepo) ? inRepo : undefined;
}

function visitElements(
  node: Root | RootContent,
  apply: (element: Element) => void,
): void {
  if (node.type === "element") {
    apply(node);
  }

  if ("children" in node) {
    for (const child of node.children) {
      visitElements(child, apply);
    }
  }
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
export function rehypeSkillBody({
  repoRoot,
  repoUrl,
}: Options): (tree: Root, file: Pick<VFile, "path">) => void {
  return (tree: Root, file: Pick<VFile, "path">): void => {
    const skillFile = skillFileOf(file.path, repoRoot);

    if (skillFile === undefined) {
      return;
    }

    const directory = posix.dirname(skillFile);

    visitElements(tree, (element) => {
      const level = HEADING.exec(element.tagName)?.[1];

      if (level !== undefined) {
        element.tagName = `h${Math.min(Number(level) + 2, 6)}`;
      }

      const href = element.properties.href;
      const target =
        element.tagName === "a" && typeof href === "string"
          ? githubHref(href, directory, repoUrl)
          : undefined;

      if (target !== undefined) {
        element.properties.href = target;
      }
    });
  };
}
