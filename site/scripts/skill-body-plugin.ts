import { posix, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defineHastPlugin,
  type HastNode,
  type HastPluginEntry,
  type HastVisitorContext,
  type PluginFactoryContext,
} from "satteri";
import { skillPath } from "../src/lib/site.ts";

interface Options {
  repoRoot: string;
  repoUrl: string;
  /** Each catalog skill's SKILL.md path from the repository root, to the skill's name. */
  skillNames: ReadonlyMap<string, string>;
}

const SKILL_FILE = /^[^/]+\/skills\/[^/]+\/SKILL\.md$/;
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const HEADING = /^h([1-6])$/;
type Element = Extract<HastNode, { type: "element" }>;

const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/** Joined with `/` on every platform. */
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

function linkHref(
  href: string,
  directory: string,
  { repoUrl, skillNames }: Options,
): string | undefined {
  if (NOT_RELATIVE.test(href)) {
    return undefined;
  }

  const hash = href.indexOf("#");
  const target = posix.join(
    directory,
    hash === -1 ? href : href.slice(0, hash),
  );
  const fragment = hash === -1 ? "" : href.slice(hash);
  const skillName = skillNames.get(target);

  return skillName === undefined
    ? `${repoUrl}/blob/main/${target}${fragment}`
    : `${skillPath(skillName)}${fragment}`;
}

/**
 * The text of the heading above the table, or `Table <n>` under none. Names of regions on one page
 * must differ (axe `landmark-unique`), so a repeat gets the table's number too.
 */
function makeTableLabel(
  heading: string | undefined,
  tableNumber: number,
  taken: ReadonlySet<string>,
): string {
  if (heading === undefined) {
    return `Table ${tableNumber}`;
  }

  return taken.has(heading) ? `${heading}, table ${tableNumber}` : heading;
}

/**
 * Headings move down two levels (capped at h6) because the page owns the `h1` and the section's
 * `h2`.
 */
export function skillBodyPlugin(options: Options): HastPluginEntry {
  return (context: PluginFactoryContext): HastPluginEntry => {
    const skillFile = skillFileOf(context.fileURL, options.repoRoot);

    if (skillFile === undefined) {
      return null;
    }

    const directory = posix.dirname(skillFile);
    const tableLabels = new Set<string>();
    let tableCount = 0;
    let lastHeading: string | undefined;

    return defineHastPlugin({
      name: "skill-body",
      element: [
        {
          filter: ["a"],
          visit: (node: Element, ctx: HastVisitorContext): void => {
            const href = node.properties.href;
            const target =
              typeof href === "string"
                ? linkHref(href, directory, options)
                : undefined;

            if (target !== undefined) {
              ctx.setProperty(node, "href", target);
            }
          },
        },
        {
          filter: ["table"],
          visit: (node: Element, ctx: HastVisitorContext): void => {
            tableCount += 1;
            const label = makeTableLabel(lastHeading, tableCount, tableLabels);
            tableLabels.add(label);

            ctx.replaceNode(node, {
              type: "element",
              tagName: "div",
              properties: {
                class: "overflow-x-auto",
                tabIndex: 0,
                role: "region",
                ariaLabel: label,
              },
              children: [node],
            });
          },
        },
        {
          filter: HEADINGS,
          visit: (node: Element, ctx: HastVisitorContext): void => {
            const level = Number(HEADING.exec(node.tagName)?.[1]);
            const text = ctx.textContent(node).trim();
            lastHeading = text === "" ? undefined : text;

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
