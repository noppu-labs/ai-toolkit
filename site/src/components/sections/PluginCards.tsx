import type { ReactElement } from "react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PluginEntry } from "../../catalog-types.ts";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function countsLine(plugin: PluginEntry): string {
  return [
    pluralize(plugin.skills.length, "skill"),
    pluralize(plugin.agentCount, "agent"),
    pluralize(plugin.ruleCount, "rule"),
  ].join(" · ");
}

interface PluginCardsProps {
  plugins: PluginEntry[];
}

export function PluginCards({ plugins }: PluginCardsProps): ReactElement {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-5xl px-6 pb-16"
    >
      <h2 className="font-semibold text-2xl tracking-tight" id={headingId}>
        Plugins
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {plugins.map((plugin) => (
          <Card key={plugin.name}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="font-mono text-lg">
                <h3>{plugin.name}</h3>
              </CardTitle>
              <Badge variant="secondary">v{plugin.version}</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {plugin.description}
              </p>
              <p className="mt-3 text-muted-foreground text-xs">
                {countsLine(plugin)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
