import {
  type ChangeEvent,
  type ReactElement,
  useCallback,
  useId,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { PluginEntry, SkillEntry } from "../../catalog-types.ts";

function matches(skill: SkillEntry, query: string): boolean {
  const q = query.toLowerCase();
  return (
    skill.name.toLowerCase().includes(q) ||
    skill.description.toLowerCase().includes(q)
  );
}

function SkillCard({ skill }: { skill: SkillEntry }): ReactElement {
  return (
    <Card>
      <CardContent>
        <a
          className="font-medium font-mono text-primary text-sm hover:underline"
          href={skill.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          {skill.name}
        </a>
        <p className="mt-2 text-muted-foreground text-sm">
          {skill.description}
        </p>
      </CardContent>
    </Card>
  );
}

interface SkillsCatalogProps {
  plugins: PluginEntry[];
}

export function SkillsCatalog({ plugins }: SkillsCatalogProps): ReactElement {
  const headingId = useId();
  const [query, setQuery] = useState("");

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      setQuery(event.target.value);
    },
    [],
  );

  const handleClear = useCallback((): void => {
    setQuery("");
  }, []);

  const groups = plugins
    .map((plugin) => ({
      plugin,
      skills: plugin.skills.filter((skill) => matches(skill, query)),
    }))
    .filter((group) => group.skills.length > 0);

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-5xl px-6 pb-16"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-semibold text-2xl tracking-tight" id={headingId}>
          Skills
        </h2>
        <Input
          aria-label="Filter skills"
          className="w-64"
          onChange={handleChange}
          placeholder="Filter skills…"
          type="text"
          value={query}
        />
      </div>
      {groups.length === 0 ? (
        <div className="mt-8 rounded-lg border border-border border-dashed p-8 text-center">
          <p className="text-muted-foreground">No skills match your filter.</p>
          <Button className="mt-3" onClick={handleClear} variant="outline">
            Clear filter
          </Button>
        </div>
      ) : (
        groups.map(({ plugin, skills }) => (
          <div className="mt-8" key={plugin.name}>
            <h3 className="font-mono text-muted-foreground text-sm">
              {plugin.name}
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => (
                <SkillCard key={skill.name} skill={skill} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
