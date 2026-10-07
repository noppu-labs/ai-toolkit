import { Search } from "lucide-react";
import { type ChangeEvent, type ReactElement, useCallback, useId } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { pluginPressedColorClass } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { CountBadge } from "./CountBadge.tsx";

export interface PluginChip {
  /** A plugin, or `all`. */
  name: string;
  /** Skills the search matches in it. */
  count: number;
}

interface SkillFilterBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  plugin: string;
  onPluginChange: (plugin: string) => void;
  chips: PluginChip[];
  /** Every skill in the catalog, for the search box's placeholder. */
  skillCount: number;
  /** Desktop widths have room for example searches in the placeholder. */
  wide: boolean;
}

export function SkillFilterBar({
  query,
  onQueryChange,
  plugin,
  onPluginChange,
  chips,
  skillCount,
  wide,
}: SkillFilterBarProps): ReactElement {
  const inputId = useId();

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      onQueryChange(event.target.value);
    },
    [onQueryChange],
  );

  // Pressing the active chip would empty a single-select group; keep it.
  const handlePluginChange = useCallback(
    (value: string[]): void => {
      const [next] = value;
      if (next !== undefined) {
        onPluginChange(next);
      }
    },
    [onPluginChange],
  );

  return (
    <div className="sticky top-header z-5 -mx-4 border-edge border-b-2 bg-secondary-background pt-2.5 pb-2 sm:-mx-6 lg:mx-0 lg:pt-3 lg:pb-3.5 lg:shadow-[0.5rem_0_0_0_var(--secondary-background)]">
      <div className="relative px-4 sm:px-6 lg:px-0">
        <label className="sr-only" htmlFor={inputId}>
          Filter skills
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-3.25 left-7.5 size-4.5 sm:left-9.5 md:top-3.75 lg:left-3.5"
          strokeWidth={2.5}
        />
        <input
          className="h-11 w-full rounded-base border-2 border-edge bg-background pr-3 pl-10 font-base text-base text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background md:h-12 md:pr-3.5 md:pl-10.5 md:shadow-shadow-md"
          id={inputId}
          onChange={handleQueryChange}
          placeholder={
            wide
              ? `Filter ${skillCount} skills: review, brief, testing…`
              : `Filter ${skillCount} skills…`
          }
          type="search"
          value={query}
        />
      </div>
      <ToggleGroup
        aria-label="Filter by plugin"
        className="mt-2.5 w-full flex-nowrap gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:px-6 md:flex-wrap md:gap-2.5 md:overflow-x-visible lg:mt-2 lg:px-0"
        onValueChange={handlePluginChange}
        spacing={2}
        value={[plugin]}
      >
        {chips.map(({ name, count }) => (
          <ToggleGroupItem
            className={cn(
              "group/chip h-10 gap-2 rounded-full bg-background pr-1.25 pl-3.5 font-bold font-mono text-[13px] text-foreground shadow-none focus-visible:ring-offset-secondary-background data-pressed:text-black data-pressed:shadow-shadow-md md:h-11 md:gap-2.5 md:pr-1.5 md:pl-4 md:text-sm",
              count === 0 && "opacity-50",
              // "all" is no plugin, so it falls back to the main colour.
              pluginPressedColorClass(name),
            )}
            key={name}
            value={name}
          >
            {name}
            <CountBadge
              className="bg-foreground text-background group-data-pressed/chip:bg-black group-data-pressed/chip:text-white md:h-7 md:min-w-7 md:px-2 md:text-sm"
              count={count}
            />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
