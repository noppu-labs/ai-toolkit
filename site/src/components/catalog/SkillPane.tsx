import { ArrowLeft, ArrowRight } from "lucide-react";
import { type ReactElement, useId } from "react";
import type { CatalogSkill } from "@/lib/catalog";
import { pluginColorClass } from "@/lib/plugins";
import { cn } from "@/lib/utils";
import { SkillDetailBody, SkillPosition } from "./SkillDetail.tsx";

const STEP_BUTTON =
  "inline-flex h-10 items-center gap-1.5 rounded-base border-2 border-edge px-3 font-bold text-foreground text-sm transition-colors hover:bg-secondary-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4";

interface SkillPaneProps {
  id: string;
  skill: CatalogSkill;
  /** 1-based place in the filtered list, or `null` when the filter hides the skill. */
  position: number | null;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}

/** The desktop detail pane beside the list: always shows the selected skill. */
export function SkillPane({
  id,
  skill,
  position,
  total,
  onPrevious,
  onNext,
}: SkillPaneProps): ReactElement {
  const titleId = useId();

  return (
    <aside
      aria-label="Skill details"
      className="sticky top-[calc(var(--header-height)+1.25rem)] max-h-[calc(100dvh-var(--header-height)-2.5rem)] overflow-y-auto overscroll-contain rounded-[12px] border-3 border-edge bg-background shadow-shadow-xl"
      id={id}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2.5 border-border border-b-3 px-4.5 py-3.5 text-black",
          pluginColorClass(skill.plugin),
        )}
      >
        <span className="font-bold font-mono text-sm">{skill.plugin}</span>
        <SkillPosition position={position} total={total} />
      </div>
      <div className="px-5 pt-5 pb-5.5">
        <h3
          className="break-words font-mono text-[26px] leading-[1.15]"
          id={titleId}
        >
          {skill.name}
        </h3>
        {/* Selecting a row leaves focus on the list; this tells screen readers what the pane now shows. */}
        <p aria-live="polite" className="sr-only">
          {`Showing ${skill.name}`}
        </p>
        <SkillDetailBody skill={skill} surface="pane" />
        <div className="mt-3.5 flex justify-between gap-3">
          <button className={STEP_BUTTON} onClick={onPrevious} type="button">
            <ArrowLeft aria-hidden="true" strokeWidth={2.5} />
            Previous<span className="sr-only"> skill</span>
          </button>
          <button className={STEP_BUTTON} onClick={onNext} type="button">
            Next<span className="sr-only"> skill</span>
            <ArrowRight aria-hidden="true" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
