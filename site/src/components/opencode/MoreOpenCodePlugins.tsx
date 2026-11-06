import { ArrowRight, ChevronRight } from "lucide-react";
import { type ReactElement, useId } from "react";
import type { PluginEntry } from "@/catalog-types";
import { OPENCODE_PATH } from "@/lib/opencode";
import type { OpenCodeCard } from "@/lib/opencode-cards";
import { pluginColorClass, sortPlugins } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { InlineText } from "./InlineText.tsx";

interface Row {
  name: string;
  summary: string;
  href: string;
  accentClass: string;
}

function toolkitRows(plugins: readonly PluginEntry[]): Row[] {
  return sortPlugins(plugins)
    .filter((plugin) => plugin.opencodePackage !== undefined)
    .map((plugin) => ({
      name: plugin.name,
      summary: plugin.description,
      href: OPENCODE_PATH,
      accentClass: pluginColorClass(plugin.name),
    }));
}

/** The foot of a plugin page: the other synced plugins, the toolkit's OpenCode packages and the hub. */
export function MoreOpenCodePlugins({
  plugins,
  toolkitPlugins,
}: {
  /** The other synced plugins, each linking to its page. */
  plugins: readonly OpenCodeCard[];
  /** The toolkit's plugins; those with an OpenCode package are listed, linking to the hub. */
  toolkitPlugins: readonly PluginEntry[];
}): ReactElement {
  const headingId = useId();
  const rows: Row[] = [...plugins, ...toolkitRows(toolkitPlugins)];

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 px-4 pt-6 pb-14 sm:px-6 md:pt-8 md:pb-22"
    >
      <h2
        className="text-[26px] leading-[1.05] tracking-[-0.03em] md:text-[34px]"
        id={headingId}
      >
        More OpenCode plugins
      </h2>
      <ul className="mt-4 overflow-hidden rounded-[10px] border-3 border-edge bg-secondary-background shadow-shadow-md md:mt-6 md:shadow-shadow">
        {rows.map((row) => (
          <li className="border-edge not-last:border-b-2" key={row.name}>
            <a
              className="group/row flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-foreground no-underline outline-hidden hover:bg-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset md:gap-3.5 md:px-4.5 md:py-3.5"
              href={row.href}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 rounded-sm border-2 border-border",
                  row.accentClass,
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.75 md:gap-1">
                <span className="font-mono text-sm font-bold break-words underline-offset-3 group-hover/row:underline group-hover/row:decoration-2 md:text-base">
                  {row.name}
                </span>
                <span className="text-sm leading-[1.35] text-muted-foreground md:text-[15px] md:leading-[1.4]">
                  <InlineText text={row.summary} />
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4.5 shrink-0"
                strokeWidth={2.5}
              />
            </a>
          </li>
        ))}
      </ul>
      <a
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-base border-2 border-edge bg-secondary-background px-3.5 py-2 text-[15px] font-heading text-foreground no-underline shadow-shadow-md transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden md:mt-6"
        href={OPENCODE_PATH}
      >
        All OpenCode plugins
        <ArrowRight aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
      </a>
    </section>
  );
}
