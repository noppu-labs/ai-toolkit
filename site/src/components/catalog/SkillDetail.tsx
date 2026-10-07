import {
  type ReactElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { buttonVariants } from "@/components/ui/button-variants";
import type { CatalogSkill } from "@/lib/catalog";
import {
  INSTALL_METHOD_LABELS,
  otherInstallMethod,
  pluginInstallSteps,
} from "@/lib/install-methods";
import { skillShareUrl } from "@/lib/site";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/stores/usePreferencesStore";

/** Where the detail sits: the desktop pane (on `background`) or the phone sheet (on `secondary-background`). */
export type DetailSurface = "pane" | "sheet";

const SWITCH_LABELS = {
  "claude-code": "Use Claude Code instead",
  "skills-cli": "Use the skills CLI instead",
} as const;

export interface SkillPositionProps {
  /** 1-based place in the filtered list, or `null` when the filter hides the skill. */
  position: number | null;
  total: number;
  className?: string;
}

/** "3 of 30", or "– of 30" when the skill is filtered out of the list. */
export function SkillPosition({
  position,
  total,
  className,
}: SkillPositionProps): ReactElement {
  return (
    <span className={cn("font-bold font-mono text-[13px]", className)}>
      {position ?? "–"} of {total}
    </span>
  );
}

/** Remount it with a `key` per skill: `expanded` and `clamped` belong to one text. */
function AgentText({ text }: { text: string }): ReactElement {
  const textId = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);

  // Measured rather than guessed from the length: the pane and the sheet differ in width.
  useLayoutEffect(() => {
    const element = textRef.current;
    if (element === null || expanded) {
      return;
    }
    const measure = (): void => {
      setClamped(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return (): void => observer.disconnect();
  }, [expanded]);

  const handleToggle = useCallback((): void => {
    setExpanded((value) => !value);
  }, []);

  return (
    <div className="mt-4 rounded-[8px] border-2 border-edge border-dashed px-3 py-2.5 md:mt-4.5 md:px-3.5 md:py-3">
      <p className="font-bold font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        What your agent reads
      </p>
      <p
        className={cn(
          "mt-1.5 text-[13.5px] text-muted-foreground leading-normal md:text-sm md:leading-[1.55]",
          !expanded && "line-clamp-4",
        )}
        id={textId}
        ref={textRef}
      >
        {text}
      </p>
      {clamped ? (
        <button
          aria-controls={textId}
          aria-expanded={expanded}
          className="mt-1.5 inline-flex min-h-8 items-center rounded-sm font-bold text-foreground text-sm underline underline-offset-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          onClick={handleToggle}
          type="button"
        >
          {expanded ? "Show less" : "Show all"}
        </button>
      ) : null}
    </div>
  );
}

function SkillInstall({ plugin }: { plugin: string }): ReactElement {
  const method = usePreferencesStore((state) => state.installMethod);
  const setInstallMethod = usePreferencesStore(
    (state) => state.setInstallMethod,
  );
  const other = otherInstallMethod(method);
  const steps = pluginInstallSteps(plugin, method);

  const handleSwitch = useCallback((): void => {
    setInstallMethod(other);
  }, [other, setInstallMethod]);

  return (
    <div className="mt-4 rounded-[8px] border-2 border-border bg-terminal px-3 py-2.5 md:mt-4.5 md:px-3.5 md:py-3">
      <span className="mb-1.5 block font-bold text-terminal-foreground/75 text-xs uppercase tracking-[0.08em] md:mb-2">
        Install {plugin} · {INSTALL_METHOD_LABELS[method].short}
      </span>
      {/* A Copy button per command: a multi-line paste reaches Claude Code as one prompt. */}
      <ol className="flex flex-col gap-2 text-[12.5px] leading-[1.55] md:text-[13.5px] md:leading-[1.6]">
        {steps.map((step) => (
          <li className="flex items-center gap-2.5" key={step.command}>
            <CommandLine
              className={cn(
                "min-w-0 flex-1",
                step.muted
                  ? "text-terminal-foreground/70"
                  : "text-terminal-foreground",
              )}
              command={step.command}
              marker={step.marker}
            />
            <CopyButton
              aria-label={step.copyLabel}
              className="h-9 shrink-0 border-border bg-white px-2.5 font-heading text-[13px] text-black shadow-none hover:translate-x-0 hover:translate-y-0 focus-visible:ring-offset-terminal md:px-3 [&>svg]:hidden"
              content={step.command}
              copiedLabel="Copied!"
              key={method}
              label="Copy"
            />
          </li>
        ))}
      </ol>
      <button
        className="mt-2 inline-flex min-h-8 items-center rounded-sm font-bold text-[13px] text-terminal-foreground underline underline-offset-3 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-terminal-foreground"
        onClick={handleSwitch}
        type="button"
      >
        {SWITCH_LABELS[other]}
      </button>
    </div>
  );
}

interface SkillDetailBodyProps {
  skill: CatalogSkill;
  surface: DetailSurface;
}

/** Everything below the skill's name, which the pane and the sheet each render themselves. */
export function SkillDetailBody({
  skill,
  surface,
}: SkillDetailBodyProps): ReactElement {
  const inPane = surface === "pane";

  return (
    <>
      <p className="mt-2.5 text-[17px] leading-normal md:mt-3 md:text-lg">
        {skill.summary}
      </p>
      <p className="mt-3 text-muted-foreground text-sm md:mt-3.5">
        Invoked as{" "}
        <code
          className={cn(
            "break-all rounded-sm border-2 border-edge px-1.5 py-0.5 font-bold font-mono text-foreground",
            inPane ? "bg-secondary-background" : "bg-background",
          )}
        >
          {skill.plugin}:{skill.name}
        </code>
      </p>
      <AgentText
        key={`${skill.plugin}/${skill.name}`}
        text={skill.description}
      />
      <SkillInstall plugin={skill.plugin} />
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 md:mt-4 md:gap-3">
        <CopyButton
          aria-label={`Copy link to ${skill.name}`}
          className={cn(
            "h-12 px-2 font-heading text-[15px] shadow-shadow-md [&>svg]:hidden",
            inPane
              ? "bg-secondary-background focus-visible:ring-offset-background"
              : "bg-background focus-visible:ring-offset-secondary-background",
          )}
          content={skillShareUrl(skill.name)}
          copiedLabel="Link copied!"
          label="Copy link"
        />
        <a
          className={cn(
            buttonVariants({ variant: "default" }),
            "h-12 gap-1.5 px-2 font-heading text-[15px] shadow-shadow-md",
            inPane
              ? "ring-offset-background"
              : "ring-offset-secondary-background",
          )}
          href={skill.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          SKILL.md<span className="sr-only"> of {skill.name}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </>
  );
}
