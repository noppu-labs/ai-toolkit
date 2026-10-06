import { Search } from "lucide-react";
import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useId,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  pluginColorClass,
  pluginPressedColorClass,
  sortPlugins,
} from "@/lib/plugins";
import { cn } from "@/lib/utils";
import type { PluginEntry, SkillEntry } from "../../catalog-types.ts";

const ALL = "all";

interface CatalogSkill extends SkillEntry {
  plugin: string;
}

function matches(skill: SkillEntry, query: string): boolean {
  const q = query.toLowerCase();
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q)
  );
}

function inPlugin(skill: CatalogSkill, plugin: string): boolean {
  return plugin === ALL || skill.plugin === plugin;
}

function SkillCard({ skill }: { skill: CatalogSkill }): ReactElement {
  return (
    <article className="flex flex-col gap-2.5 rounded-[10px] border-2 border-border bg-background px-4.5 pt-4.5 pb-5 shadow-shadow">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 break-words font-mono text-[15px]">
          <a
            className="rounded-sm text-foreground underline-offset-[3px] hover:underline hover:decoration-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            href={skill.sourceUrl}
            rel="noreferrer"
            target="_blank"
          >
            {skill.name}
          </a>
        </h3>
        <span
          className={cn(
            "flex-none rounded-sm border-2 border-border px-2 py-0.5 font-bold font-mono text-[11px] text-black",
            pluginColorClass(skill.plugin),
          )}
        >
          {skill.plugin}
        </span>
      </div>
      <p className="text-[15px] text-muted-foreground leading-normal">
        {skill.description}
      </p>
    </article>
  );
}

interface SkillsCatalogProps {
  plugins: PluginEntry[];
}

export function SkillsCatalog({ plugins }: SkillsCatalogProps): ReactElement {
  const headingId = useId();
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [plugin, setPlugin] = useState(ALL);

  const sorted = useMemo(() => sortPlugins(plugins), [plugins]);
  const allSkills = useMemo(
    (): CatalogSkill[] =>
      sorted.flatMap((p) => p.skills.map((s) => ({ ...s, plugin: p.name }))),
    [sorted],
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setQuery(event.target.value);
    },
    [],
  );

  // Pressing the active chip would empty a single-select group; keep it.
  const handlePluginChange = useCallback((value: string[]): void => {
    const [next] = value;
    if (next !== undefined) {
      setPlugin(next);
    }
  }, []);

  const handleClear = useCallback((): void => {
    setQuery("");
    setPlugin(ALL);
  }, []);

  const queried = allSkills.filter((skill) => matches(skill, query));
  const visible = queried.filter((skill) => inPlugin(skill, plugin));
  const chips = [ALL, ...sorted.map((p) => p.name)].map((name) => ({
    name,
    count: queried.filter((skill) => inPlugin(skill, name)).length,
  }));

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="scroll-mt-24 border-border border-y-3 bg-secondary-background"
      id="skills"
    >
      <div className="mx-auto max-w-300 px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-bold font-mono text-sm uppercase tracking-[0.08em]">
              03 — Skills
            </p>
            <h2
              className="mt-3 text-4xl leading-none tracking-[-0.03em] sm:text-5xl"
              id={headingId}
            >
              The whole catalog.
            </h2>
          </div>
          <div className="min-w-60 flex-[0_1_360px]">
            <Label className="mb-2 block font-bold" htmlFor={inputId}>
              Filter skills
            </Label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-3.75 left-3.5 size-4.5"
                strokeWidth={2.5}
              />
              <Input
                className="h-12 bg-background pr-3.5 pl-10.5 text-base shadow-shadow dark:border-foreground/60"
                id={inputId}
                onChange={handleQueryChange}
                placeholder="e.g. review, brief, testing…"
                type="search"
                value={query}
              />
            </div>
          </div>
        </div>

        <ToggleGroup
          aria-label="Filter by plugin"
          className="mt-8 w-full flex-wrap"
          onValueChange={handlePluginChange}
          spacing={3}
          value={[plugin]}
        >
          {chips.map(({ name, count }) => (
            <ToggleGroupItem
              className={cn(
                "h-11 rounded-full bg-background px-4 font-bold font-mono text-foreground text-sm focus-visible:ring-offset-secondary-background data-pressed:-translate-x-px data-pressed:-translate-y-px data-pressed:shadow-shadow-md dark:not-data-pressed:border-foreground/60",
                // "all" is no plugin, so it falls back to the main colour.
                pluginPressedColorClass(name),
              )}
              key={name}
              value={name}
            >
              {name} <span className="font-medium">{count}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <output aria-live="polite" className="sr-only">
          {visible.length === 1
            ? "1 skill shown"
            : `${visible.length} skills shown`}
        </output>

        {visible.length === 0 ? (
          <div className="mt-6 rounded-[10px] border-2 border-current border-dashed p-8 text-center">
            <p className="font-medium text-lg">No skills match your filter.</p>
            <Button
              className="mt-4 h-11"
              onClick={handleClear}
              variant="neutral"
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="mt-9 grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))] gap-5">
            {visible.map((skill) => (
              <SkillCard key={`${skill.plugin}/${skill.name}`} skill={skill} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
