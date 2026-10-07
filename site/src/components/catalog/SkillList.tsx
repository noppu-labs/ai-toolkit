import { ChevronRight } from "lucide-react";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useRef,
} from "react";
import {
  type CatalogSkill,
  SKILL_ROW_ATTRIBUTE,
  type SkillGroup,
} from "@/lib/catalog";
import { pluginColorClass } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { CountBadge } from "./CountBadge.tsx";

interface SkillRowProps {
  skill: CatalogSkill;
  /** Whether the pane beside the list shows this skill (desktop only). */
  current: boolean;
  /** The desktop pane's id; without it, rows open the phone sheet. */
  paneId: string | null;
  onSelect: (skill: CatalogSkill) => void;
}

function SkillRow({
  skill,
  current,
  paneId,
  onSelect,
}: SkillRowProps): ReactElement {
  const handleClick = useCallback((): void => {
    onSelect(skill);
  }, [onSelect, skill]);

  return (
    <li className="border-edge not-last:border-b-2">
      <button
        aria-controls={paneId ?? undefined}
        aria-current={current ? "true" : undefined}
        aria-haspopup={paneId === null ? "dialog" : undefined}
        className={cn(
          "group/row flex min-h-16 w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left outline-hidden focus-visible:ring-3 focus-visible:ring-inset md:gap-3.5 md:px-4 md:py-3",
          current
            ? cn(
                "text-black focus-visible:ring-black",
                pluginColorClass(skill.plugin),
              )
            : "text-foreground hover:bg-secondary-background focus-visible:ring-ring",
        )}
        data-skill-row={skill.name}
        onClick={handleClick}
        type="button"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.75 md:gap-1">
          <span className="break-words font-bold font-mono text-sm underline-offset-3 group-hover/row:underline group-hover/row:decoration-2 md:text-[15px]">
            {skill.name}
          </span>
          <span className="truncate text-muted-foreground text-sm leading-[1.35] md:whitespace-normal md:text-[15px] md:text-current md:leading-[1.4] md:opacity-85">
            {skill.summary}
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4.5 shrink-0"
          strokeWidth={2.5}
        />
      </button>
    </li>
  );
}

interface SkillGroupListProps {
  group: SkillGroup;
  selected: CatalogSkill | null;
  paneId: string | null;
  onSelect: (skill: CatalogSkill) => void;
  onExpand: (group: SkillGroup) => void;
}

function SkillGroupList({
  group,
  selected,
  paneId,
  onSelect,
  onExpand,
}: SkillGroupListProps): ReactElement {
  const headingId = useId();
  const hidden = group.skills.length - group.shown.length;

  const handleExpand = useCallback((): void => {
    onExpand(group);
  }, [group, onExpand]);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2 md:mb-2.5 md:gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 rounded-[3px] border-2 border-border md:size-4 md:rounded-[4px]",
            pluginColorClass(group.plugin),
          )}
        />
        <h3
          className="flex items-center gap-2 font-mono text-[15px] md:gap-2.5 md:text-[17px]"
          id={headingId}
        >
          {group.plugin}
          <CountBadge
            className="h-6 min-w-6 bg-foreground text-background text-xs md:h-6.5 md:min-w-6.5 md:text-[13px]"
            count={group.skills.length}
          />
        </h3>
      </div>
      <ul
        aria-labelledby={headingId}
        className="overflow-hidden rounded-[10px] border-2 border-edge bg-background shadow-shadow-md md:shadow-shadow"
      >
        {group.shown.map((skill) => (
          <SkillRow
            current={skill === selected}
            key={skill.name}
            onSelect={onSelect}
            paneId={paneId}
            skill={skill}
          />
        ))}
        {hidden > 0 ? (
          <li>
            <button
              className={cn(
                "h-12 w-full cursor-pointer font-heading text-[15px] text-black outline-hidden focus-visible:ring-3 focus-visible:ring-black focus-visible:ring-inset",
                pluginColorClass(group.plugin),
              )}
              onClick={handleExpand}
              type="button"
            >
              Show {hidden} more
              <span className="sr-only"> {group.plugin} skills</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

interface SkillListProps {
  groups: SkillGroup[];
  /** The skill the desktop pane shows; `null` on phones, where rows open a sheet. */
  selected: CatalogSkill | null;
  paneId: string | null;
  onSelect: (skill: CatalogSkill) => void;
  onExpand: (plugin: string) => void;
}

/** The filtered skills, grouped by plugin. */
export function SkillList({
  groups,
  selected,
  paneId,
  onSelect,
  onExpand,
}: SkillListProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);
  // "Show more" disappears once pressed; focus moves to the first row it revealed.
  const focusAfterExpand = useRef<string | null>(null);

  const handleExpand = useCallback(
    (group: SkillGroup): void => {
      focusAfterExpand.current = group.skills[group.shown.length]?.name ?? null;
      onExpand(group.plugin);
    },
    [onExpand],
  );

  useEffect(() => {
    const name = focusAfterExpand.current;
    if (name === null || groups.length === 0) {
      return;
    }
    focusAfterExpand.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[${SKILL_ROW_ATTRIBUTE}="${CSS.escape(name)}"]`,
      )
      ?.focus();
  }, [groups]);

  return (
    <div className="flex flex-col gap-5 md:gap-7" ref={listRef}>
      {groups.map((group) => (
        <SkillGroupList
          group={group}
          key={group.plugin}
          onExpand={handleExpand}
          onSelect={onSelect}
          paneId={paneId}
          selected={selected}
        />
      ))}
    </div>
  );
}
