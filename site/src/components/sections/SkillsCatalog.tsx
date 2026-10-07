import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import {
  type PluginChip,
  SkillFilterBar,
} from "@/components/catalog/SkillFilterBar";
import { SkillList } from "@/components/catalog/SkillList";
import { SkillPane } from "@/components/catalog/SkillPane";
import { SkillSheet } from "@/components/catalog/SkillSheet";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSearchParam } from "@/hooks/useSearchParam";
import {
  ALL_PLUGINS,
  type CatalogSkill,
  catalogSkills,
  findSkill,
  groupSkills,
  inPlugin,
  matchesQuery,
  type SkillGroup,
} from "@/lib/catalog";
import { sortPlugins } from "@/lib/plugins";
import { pluralize } from "@/lib/pluralize";
import {
  PLUGIN_PARAM,
  QUERY_PARAM,
  SKILL_PARAM,
  writeSearchParams,
} from "@/lib/url-state";
import type { PluginEntry } from "../../catalog-types.ts";

/** Tailwind's `lg`: from here the list and the detail pane sit side by side. */
const DESKTOP_QUERY = "(width >= 64rem)";

/** Rows a long group shows before "Show more". */
const COLLAPSED_ROWS = { desktop: 6, phone: 4 } as const;

/** The history state of the entry a phone sheet pushes, so its close button can go back rather than add another. */
const SHEET_ENTRY = "ai-toolkit:skill-sheet";

interface Neighbours {
  previous: CatalogSkill;
  next: CatalogSkill;
}

/** The skills before and after `skill` in `list`, wrapping around; the ends when it is not in the list. */
function neighbours(
  list: readonly CatalogSkill[],
  skill: CatalogSkill,
): Neighbours | null {
  const last = list.at(-1);
  const first = list[0];
  if (first === undefined || last === undefined) {
    return null;
  }
  const index = list.indexOf(skill);
  if (index === -1) {
    return { previous: last, next: first };
  }
  return {
    previous: list[(index - 1 + list.length) % list.length] ?? last,
    next: list[(index + 1) % list.length] ?? first,
  };
}

function deviceOf(desktop: boolean): keyof typeof COLLAPSED_ROWS {
  return desktop ? "desktop" : "phone";
}

/** Long groups collapse only while nothing narrows the list. */
function collapseLimit(
  query: string,
  plugin: string,
  desktop: boolean,
): number | null {
  const narrowed = query.trim() !== "" || plugin !== ALL_PLUGINS;
  return narrowed ? null : COLLAPSED_ROWS[deviceOf(desktop)];
}

/** The plugin of `skill` when its group collapses it out of view, for expanding that group. */
function pastTheFold(
  skills: readonly CatalogSkill[],
  skill: CatalogSkill | null,
  collapseAt: number,
): string[] {
  if (skill === null) {
    return [];
  }
  const siblings = skills.filter((other) => other.plugin === skill.plugin);
  return siblings.indexOf(skill) >= collapseAt ? [skill.plugin] : [];
}

function isShown(groups: readonly SkillGroup[], skill: CatalogSkill): boolean {
  return groups.some((group) => group.shown.includes(skill));
}

/**
 * True from the render where the layout narrows from desktop to phone until
 * the selection is cleared: a skill picked in the pane must not open a sheet
 * the visitor never asked for.
 */
function useLeftDesktop(desktop: boolean): boolean {
  const [wasDesktop, setWasDesktop] = useState(desktop);
  const leftDesktop = wasDesktop && !desktop;

  useEffect(() => {
    if (wasDesktop === desktop) {
      return;
    }
    if (leftDesktop) {
      writeSearchParams({ [SKILL_PARAM]: null });
    }
    setWasDesktop(desktop);
  }, [desktop, leftDesktop, wasDesktop]);

  return leftDesktop;
}

interface CatalogState {
  query: string;
  /** A plugin name, or `all`. */
  plugin: string;
  /** The skill named in the URL, when it exists. */
  chosen: CatalogSkill | null;
  changeQuery: (query: string) => void;
  /** Also clears the selected skill, which could sit outside the new filter. */
  changePlugin: (plugin: string) => void;
  clearFilter: () => void;
  /** Selects a skill; on phones, opens it in the sheet. */
  choose: (skill: CatalogSkill) => void;
  closeSheet: () => void;
}

/** The filter and selection, kept in the URL (`?q=`, `?plugin=`, `?skill=`) so any view can be linked to. */
function useCatalogState(
  skills: readonly CatalogSkill[],
  pluginNames: readonly string[],
  desktop: boolean,
): CatalogState {
  const query = useSearchParam(QUERY_PARAM) ?? "";
  const pluginParam = useSearchParam(PLUGIN_PARAM);
  const skillParam = useSearchParam(SKILL_PARAM);

  const plugin =
    pluginParam !== null && pluginNames.includes(pluginParam)
      ? pluginParam
      : ALL_PLUGINS;
  const chosen = useMemo(
    () => (skillParam === null ? null : findSkill(skills, skillParam)),
    [skills, skillParam],
  );

  const changeQuery = useCallback((next: string): void => {
    writeSearchParams({ [QUERY_PARAM]: next });
  }, []);

  const changePlugin = useCallback((next: string): void => {
    writeSearchParams({
      [PLUGIN_PARAM]: next === ALL_PLUGINS ? null : next,
      [SKILL_PARAM]: null,
    });
  }, []);

  const clearFilter = useCallback((): void => {
    writeSearchParams({ [QUERY_PARAM]: null, [PLUGIN_PARAM]: null });
  }, []);

  // On phones the sheet gets its own history entry, so Back closes it.
  const choose = useCallback(
    (skill: CatalogSkill): void => {
      writeSearchParams(
        { [SKILL_PARAM]: skill.name },
        desktop ? {} : { push: true, state: SHEET_ENTRY },
      );
    },
    [desktop],
  );

  // A sheet opened from a shared link has no entry of its own to go back from.
  const closeSheet = useCallback((): void => {
    if (window.history.state === SHEET_ENTRY) {
      window.history.back();
    } else {
      writeSearchParams({ [SKILL_PARAM]: null });
    }
  }, []);

  return {
    query,
    plugin,
    chosen,
    changeQuery,
    changePlugin,
    clearFilter,
    choose,
    closeSheet,
  };
}

function chipCounts(
  queried: readonly CatalogSkill[],
  pluginNames: readonly string[],
): PluginChip[] {
  return [ALL_PLUGINS, ...pluginNames].map((name) => ({
    name,
    count: queried.filter((skill) => inPlugin(skill, name)).length,
  }));
}

interface Selection {
  /** What the desktop pane shows: the chosen skill, else the first in the list; `null` when the list is empty. */
  selected: CatalogSkill | null;
  /** Its 1-based place in the filtered list, or `null` when the filter hides it. */
  position: number | null;
}

function selection(
  filtered: readonly CatalogSkill[],
  chosen: CatalogSkill | null,
): Selection {
  const selected =
    filtered.length === 0 ? null : (chosen ?? filtered[0] ?? null);
  const index = selected === null ? -1 : filtered.indexOf(selected);
  return { selected, position: index === -1 ? null : index + 1 };
}

/** Previous and Next in the pane: they cycle through the filtered list, opening a collapsed group on the way. */
function useStepper(
  filtered: readonly CatalogSkill[],
  groups: readonly SkillGroup[],
  selected: CatalogSkill | null,
  choose: (skill: CatalogSkill) => void,
  expand: (plugin: string) => void,
): Record<keyof Neighbours, () => void> {
  const step = useCallback(
    (direction: keyof Neighbours): void => {
      const target =
        selected === null
          ? undefined
          : neighbours(filtered, selected)?.[direction];
      if (target === undefined) {
        return;
      }
      if (!isShown(groups, target)) {
        expand(target.plugin);
      }
      choose(target);
    },
    [choose, expand, filtered, groups, selected],
  );
  const previous = useCallback((): void => step("previous"), [step]);
  const next = useCallback((): void => step("next"), [step]);
  return { previous, next };
}

/** Plugins whose long groups the visitor opened with "Show more" (or Previous and Next). */
function useExpandedGroups(
  initial: () => string[],
): [ReadonlySet<string>, (plugin: string) => void] {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(initial()),
  );
  const expand = useCallback((plugin: string): void => {
    setExpanded((current) => new Set(current).add(plugin));
  }, []);
  return [expanded, expand];
}

interface SkillsCatalogProps {
  plugins: PluginEntry[];
}

export function SkillsCatalog({ plugins }: SkillsCatalogProps): ReactElement {
  const headingId = useId();
  const paneId = useId();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const leftDesktop = useLeftDesktop(desktop);

  const skills = useMemo(() => catalogSkills(plugins), [plugins]);
  const pluginNames = useMemo(
    () => sortPlugins(plugins).map((plugin) => plugin.name),
    [plugins],
  );
  const {
    query,
    plugin,
    chosen,
    changeQuery,
    changePlugin,
    clearFilter,
    choose,
    closeSheet,
  } = useCatalogState(skills, pluginNames, desktop);

  // `pinned` below keeps the selected skill's group open. On phones the
  // selection ends when the sheet closes, so a deep link past the fold also
  // opens its group, for focus to return to the row.
  const [expanded, expand] = useExpandedGroups(() =>
    desktop ? [] : pastTheFold(skills, chosen, COLLAPSED_ROWS.phone),
  );

  const queried = useMemo(
    () => skills.filter((skill) => matchesQuery(skill, query)),
    [skills, query],
  );
  const filtered = useMemo(
    () => queried.filter((skill) => inPlugin(skill, plugin)),
    [queried, plugin],
  );
  const collapseAt = collapseLimit(query, plugin, desktop);
  const groups = useMemo(
    () =>
      groupSkills(filtered, pluginNames, {
        collapseAt,
        expanded,
        pinned: chosen,
      }),
    [filtered, pluginNames, collapseAt, expanded, chosen],
  );
  const chips = useMemo(
    () => chipCounts(queried, pluginNames),
    [queried, pluginNames],
  );

  const { selected, position } = selection(filtered, chosen);
  const stepper = useStepper(filtered, groups, selected, choose, expand);

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="scroll-mt-header border-edge border-y-3 bg-secondary-background outline-hidden"
      id="skills"
      // Focusable from script, so following a plugin card's skills link moves focus here.
      tabIndex={-1}
    >
      <div className="mx-auto max-w-300 px-4 pt-10 pb-10 sm:px-6 md:pt-22 md:pb-24">
        <p className="font-bold font-mono text-xs uppercase tracking-[0.08em] md:text-sm">
          03 — Skills
        </p>
        <h2
          className="mt-2 text-[32px] leading-[1.05] tracking-[-0.03em] md:mt-3 md:text-5xl md:leading-none"
          id={headingId}
        >
          The whole catalog.
        </h2>

        <div className="mt-2 md:mt-5 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start lg:gap-8">
          <div className="min-w-0">
            <SkillFilterBar
              chips={chips}
              onPluginChange={changePlugin}
              onQueryChange={changeQuery}
              plugin={plugin}
              query={query}
              skillCount={skills.length}
              wide={desktop}
            />

            <output
              aria-live="polite"
              className="mt-4 mb-3 block font-bold text-[13px] text-muted-foreground md:text-sm"
            >
              {pluralize(filtered.length, "skill")}
              <span className="sr-only"> shown</span>
            </output>

            {filtered.length === 0 ? (
              <div className="rounded-[10px] border-2 border-current border-dashed p-6 text-center md:p-8">
                <p className="font-medium text-base md:text-lg">
                  No skills match your filter.
                </p>
                <Button
                  className="mt-3 h-11 px-4.5 font-heading text-[15px] shadow-shadow-md focus-visible:ring-offset-secondary-background md:mt-3.5"
                  onClick={clearFilter}
                >
                  Clear filter
                </Button>
              </div>
            ) : (
              <SkillList
                groups={groups}
                onExpand={expand}
                onSelect={choose}
                paneId={desktop ? paneId : null}
                selected={desktop ? selected : null}
              />
            )}
          </div>

          {desktop ? (
            <SkillPane
              id={paneId}
              onNext={stepper.next}
              onPrevious={stepper.previous}
              position={position}
              skill={selected}
              total={filtered.length}
            />
          ) : null}
        </div>
      </div>
      {desktop ? null : (
        <SkillSheet
          onClose={closeSheet}
          position={position}
          skill={leftDesktop ? null : chosen}
          total={filtered.length}
        />
      )}
    </section>
  );
}
