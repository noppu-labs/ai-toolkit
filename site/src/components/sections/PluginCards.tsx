import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { ArrowRight } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";
import { useCallback, useId } from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { Badge } from "@/components/ui/badge";
import {
  isLanguageAgnostic,
  pluginColorClass,
  sortPlugins,
} from "@/lib/plugins";
import { pluralize } from "@/lib/pluralize";
import { REPO_SLUG } from "@/lib/repo";
import { goToSection } from "@/lib/scroll";
import { pluginSkillsHref, writePluginParam } from "@/lib/url-state";
import { cn } from "@/lib/utils";
import {
  type InstallMethod,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";
import type { PluginEntry } from "../../catalog-types.ts";

const METHODS: readonly { id: InstallMethod; label: string }[] = [
  { id: "claude-code", label: "Claude Code" },
  { id: "skills-cli", label: "skills CLI" },
];

interface CommandStep {
  /** The glyph before the command: a step number, or the prompt. */
  marker: string;
  command: string;
  /** Muted, for the step every plugin shares. */
  muted?: boolean;
}

/** The commands a plugin card shows, and copies, for an install method. */
function pluginInstallSteps(
  plugin: string,
  method: InstallMethod,
): CommandStep[] {
  if (method === "skills-cli") {
    return [{ marker: "›", command: `npx skills add ${REPO_SLUG}/${plugin}` }];
  }
  return [
    {
      marker: "1",
      command: `/plugin marketplace add ${REPO_SLUG}`,
      muted: true,
    },
    { marker: "2", command: `/plugin install ${plugin}@ai-toolkit` },
  ];
}

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

function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function SeeSkillsLink({ plugin }: { plugin: PluginEntry }): ReactElement {
  // The link works on its own (a new tab opens the filtered catalog); a plain
  // click stays on the page: it sets the filter and scrolls to the catalog.
  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      if (!isPlainClick(event)) {
        return;
      }
      event.preventDefault();
      writePluginParam(plugin.name, { push: true, hash: "skills" });
      goToSection("skills");
    },
    [plugin.name],
  );

  return (
    <a
      className="flex min-h-11 items-center justify-between gap-2 rounded-base border-2 border-edge bg-background px-3 py-2 font-heading text-[15px] text-foreground no-underline transition-all hover:translate-x-0.75 hover:translate-y-0.75 hover:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background md:px-3.5 md:shadow-shadow-md"
      href={pluginSkillsHref(plugin.name)}
      onClick={handleClick}
    >
      See {pluralize(plugin.skills.length, `${plugin.name} skill`)}
      <ArrowRight aria-hidden="true" className="size-4.5" strokeWidth={2.5} />
    </a>
  );
}

function PluginCard({
  plugin,
  method,
}: {
  plugin: PluginEntry;
  method: InstallMethod;
}): ReactElement {
  const steps = pluginInstallSteps(plugin.name, method);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border-3 border-edge bg-secondary-background shadow-[5px_5px_0_0_var(--shadow-color)] md:shadow-shadow-lg">
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-border border-b-3 px-3.5 py-3 text-black md:gap-3 md:px-5.5 md:py-4.5",
          pluginColorClass(plugin.name),
        )}
      >
        <h3 className="break-all font-mono text-[21px] md:text-[26px]">
          {plugin.name}
        </h3>
        <Badge className="bg-white px-2 py-0.5 font-bold font-mono text-black text-xs md:px-2.5 md:py-1 md:text-[13px]">
          v{plugin.version}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5 md:gap-4.5 md:p-5.5">
        <p className="text-[15px] leading-normal md:text-[17px]">
          {plugin.description}
        </p>
        <ul
          aria-label="Contents"
          className="flex flex-wrap gap-1.5 md:mt-auto md:gap-2"
        >
          {chipLabels(plugin).map((label) => (
            <li
              className="rounded-full border-2 border-edge bg-background px-2.5 py-0.75 font-bold text-[13px] md:px-3 md:py-1.25 md:text-sm"
              key={label}
            >
              {label}
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-2.5 rounded-base border-2 border-border bg-terminal px-3 py-2.5 md:gap-3 md:px-3.5 md:py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-[12.5px] leading-[1.55] md:text-sm md:leading-[1.6]">
            {steps.map((step) => (
              <CommandLine
                className={
                  step.muted
                    ? "text-terminal-foreground/70"
                    : "text-terminal-foreground"
                }
                command={step.command}
                key={step.command}
                marker={step.marker}
              />
            ))}
          </div>
          <CopyButton
            aria-label={`Copy install commands for ${plugin.name}`}
            className="h-11 shrink-0 border-border bg-white px-2.5 font-heading text-[13px] text-black shadow-none hover:translate-x-0 hover:translate-y-0 focus-visible:ring-offset-terminal md:h-10 md:px-3 [&>svg]:hidden"
            content={steps.map((step) => step.command).join("\n")}
            copiedLabel="Copied!"
            label="Copy"
          />
        </div>
        <SeeSkillsLink plugin={plugin} />
      </div>
    </article>
  );
}

function MethodPicker({
  method,
  onChange,
}: {
  method: InstallMethod;
  onChange: (value: unknown) => void;
}): ReactElement {
  const labelId = useId();

  return (
    <div className="flex w-full items-center justify-between gap-2.5 rounded-[8px] border-2 border-edge bg-secondary-background py-1.5 pr-1.5 pl-3 md:w-auto md:pl-3.5 md:shadow-shadow-md">
      <span
        className="font-heading text-[13px] text-muted-foreground md:text-sm"
        id={labelId}
      >
        Install with
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        className="flex gap-1.5"
        onValueChange={onChange}
        value={method}
      >
        {METHODS.map(({ id, label }) => (
          <Radio.Root
            className="inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-base border-2 border-edge bg-background px-3 font-heading text-[13px] text-foreground outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-secondary-background data-checked:border-border data-checked:bg-main data-checked:text-main-foreground data-checked:shadow-shadow-sm md:h-10 md:px-3.5 md:text-sm"
            key={id}
            value={id}
          >
            {label}
          </Radio.Root>
        ))}
      </RadioGroup>
    </div>
  );
}

interface PluginCardsProps {
  plugins: PluginEntry[];
}

export function PluginCards({ plugins }: PluginCardsProps): ReactElement {
  const headingId = useId();
  const method = usePreferencesStore((state) => state.installMethod);
  const setInstallMethod = usePreferencesStore(
    (state) => state.setInstallMethod,
  );

  const handleMethodChange = useCallback(
    (value: unknown): void => {
      const next = METHODS.find((candidate) => candidate.id === value);
      if (next !== undefined) {
        setInstallMethod(next.id);
      }
    },
    [setInstallMethod],
  );

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the nav links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto max-w-300 scroll-mt-header px-4 pt-6 pb-12 sm:px-6 md:pt-8 md:pb-24"
      id="plugins"
    >
      <div className="flex flex-wrap items-end justify-between gap-4.5 md:gap-6">
        <div className="min-w-0 flex-[1_1_520px]">
          <p className="font-bold font-mono text-xs uppercase tracking-[0.08em] md:text-sm">
            02 — Plugins
          </p>
          <h2
            className="mt-2 text-[30px] leading-[1.05] tracking-[-0.03em] md:mt-3 md:text-5xl md:leading-none"
            id={headingId}
          >
            Review anywhere. Go deep on your stack.
          </h2>
          <p className="mt-5 hidden max-w-180 text-lg text-muted-foreground leading-[1.55] md:block">
            <code className="font-bold font-mono">review</code> and{" "}
            <code className="font-bold font-mono">investigate</code> work across
            PHP, TypeScript, Python and beyond.{" "}
            <code className="font-bold font-mono">laravel</code> and{" "}
            <code className="font-bold font-mono">inertia-react</code> add
            stack-specific skills, agents and rules.
          </p>
        </div>
        <MethodPicker method={method} onChange={handleMethodChange} />
      </div>
      <div className="mt-5 grid gap-5 md:mt-10 md:grid-cols-2 md:gap-8">
        {sortPlugins(plugins).map((plugin) => (
          <PluginCard key={plugin.name} method={method} plugin={plugin} />
        ))}
      </div>
    </section>
  );
}
