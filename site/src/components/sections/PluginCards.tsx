import type { ReactElement } from "react";
import { useId } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import {
  isLanguageAgnostic,
  pluginColorClass,
  sortPlugins,
} from "@/lib/plugins";
import { pluralize } from "@/lib/pluralize";
import { cn } from "@/lib/utils";
import type { PluginEntry } from "../../catalog-types.ts";

function chipLabels(plugin: PluginEntry): string[] {
  const counts: [number, string][] = [
    [plugin.skills.length, "skill"],
    [plugin.agentCount, "agent"],
    [plugin.ruleCount, "rule"],
  ];
  const labels = counts
    .filter(([count]) => count > 0)
    .map(([count, noun]) => pluralize(count, noun));
  if (isLanguageAgnostic(plugin.name)) {
    labels.push("any language");
  }
  return labels;
}

function PluginCard({ plugin }: { plugin: PluginEntry }): ReactElement {
  const command = `/plugin install ${plugin.name}@ai-toolkit`;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border-3 border-edge bg-secondary-background shadow-shadow-lg">
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-border border-b-3 px-6 py-5 text-black",
          pluginColorClass(plugin.name),
        )}
      >
        <h3 className="break-all font-mono text-2xl sm:text-[26px]">
          {plugin.name}
        </h3>
        <Badge className="bg-white px-2.5 py-1 font-bold font-mono text-[13px] text-black">
          v{plugin.version}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-5 p-6">
        <p className="text-[17px] leading-normal">{plugin.description}</p>
        <ul aria-label="Contents" className="mt-auto flex flex-wrap gap-2">
          {chipLabels(plugin).map((label) => (
            <li
              className="rounded-full border-2 border-edge bg-background px-3 py-1.5 font-bold text-sm"
              key={label}
            >
              {label}
            </li>
          ))}
        </ul>
        <div className="flex items-stretch gap-3">
          <code className="wrap-anywhere flex min-w-0 flex-1 items-center rounded-base border-2 border-edge bg-terminal px-3.5 py-2.5 font-mono text-sm text-terminal-foreground">
            {command}
          </code>
          <CopyButton
            aria-label={`Copy install command for ${plugin.name}`}
            content={command}
            size="icon-lg"
          />
        </div>
      </div>
    </article>
  );
}

interface PluginCardsProps {
  plugins: PluginEntry[];
}

export function PluginCards({ plugins }: PluginCardsProps): ReactElement {
  const headingId = useId();

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 scroll-mt-24 px-4 pt-8 pb-24 sm:px-6"
      id="plugins"
    >
      <p className="font-bold font-mono text-sm uppercase tracking-[0.08em]">
        02 — Plugins
      </p>
      <h2
        className="mt-3 text-4xl leading-none tracking-[-0.03em] sm:text-5xl"
        id={headingId}
      >
        Review anywhere. Go deep on your stack.
      </h2>
      <p className="mt-5 max-w-180 text-lg text-muted-foreground leading-[1.55]">
        <code className="font-bold font-mono">review</code> and{" "}
        <code className="font-bold font-mono">investigate</code> work across
        PHP, TypeScript, Python and beyond.{" "}
        <code className="font-bold font-mono">laravel</code> and{" "}
        <code className="font-bold font-mono">inertia-react</code> add
        stack-specific skills, agents and rules.
      </p>
      <div className="mt-10 grid gap-8 md:grid-cols-2">
        {sortPlugins(plugins).map((plugin) => (
          <PluginCard key={plugin.name} plugin={plugin} />
        ))}
      </div>
    </section>
  );
}
