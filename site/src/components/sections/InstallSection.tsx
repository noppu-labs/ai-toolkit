import { type ReactElement, type ReactNode, useCallback, useId } from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PLUGIN_ORDER } from "@/lib/plugins";
import { REPO_SLUG } from "@/lib/repo";
import {
  INSTALL_METHODS,
  type InstallMethod,
  isInstallMethod,
  usePreferencesStore,
} from "@/stores/usePreferencesStore";

interface InstallStep {
  title: string;
  /** Shown from `md` only, where the title has room for it; always part of the copy button's name. */
  detail?: string;
  commands: readonly string[];
}

interface InstallMethodTab {
  /** The tab label on phones. */
  shortLabel: ReactNode;
  /** The tab label from `md`. */
  label: ReactNode;
  steps: readonly InstallStep[];
  note: ReactNode;
}

const INSTALL_METHOD_TABS: Record<InstallMethod, InstallMethodTab> = {
  "claude-code": {
    shortLabel: "Claude Code",
    label: "Claude Code marketplace",
    steps: [
      {
        title: "Add the marketplace",
        commands: [`/plugin marketplace add ${REPO_SLUG}`],
      },
      {
        title: "Install what you need",
        commands: PLUGIN_ORDER.map(
          (plugin) => `/plugin install ${plugin}@ai-toolkit`,
        ),
      },
      {
        title: "Copy the stack rules",
        detail: "(laravel, inertia-react)",
        commands: ["/laravel:install-rules", "/inertia-react:install-rules"],
      },
    ],
    note: (
      <>
        The install-rules commands copy each stack plugin’s path-scoped rules
        into your project’s <code className="font-mono">.claude/rules/</code>.
        Review them afterwards.
      </>
    ),
  },
  "skills-cli": {
    shortLabel: "skills CLI",
    label: "Vercel skills CLI",
    steps: [
      {
        title: "Add plugins one by one",
        commands: PLUGIN_ORDER.map(
          (plugin) => `npx skills add ${REPO_SLUG}/${plugin}`,
        ),
      },
    ],
    note: (
      <>
        <code className="font-mono">{`\${CLAUDE_PLUGIN_ROOT}`}</code> is not set
        on this route, so investigate’s script paths need replacing after
        install.
      </>
    ),
  },
};

function stepName(step: InstallStep): string {
  return step.detail === undefined
    ? step.title
    : `${step.title} ${step.detail}`;
}

function Step({
  step,
  number,
}: {
  step: InstallStep;
  number: number;
}): ReactElement {
  return (
    <li>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-heading text-[15px] md:gap-2.5 md:text-base">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-border bg-main text-[13px] text-main-foreground md:size-6.5"
          >
            {number}
          </span>
          <span>
            {step.title}
            {step.detail === undefined ? null : (
              <span className="hidden md:inline"> {step.detail}</span>
            )}
          </span>
        </span>
        <CopyButton
          aria-label={`Copy step ${number}: ${stepName(step)}`}
          className="h-9 shrink-0 gap-1.5 px-2.5 font-heading text-[13px] shadow-shadow-sm focus-visible:ring-offset-secondary-background md:px-3 [&_svg]:size-3.5"
          content={step.commands.join("\n")}
          copiedLabel="Copied!"
          label="Copy"
        />
      </div>
      <div className="rounded-base border-2 border-border bg-terminal px-3 py-2.5 text-[13px] text-terminal-foreground leading-[1.55] md:px-4 md:py-3 md:text-sm md:leading-[1.8]">
        {step.commands.map((command) => (
          <CommandLine className="my-0.5" command={command} key={command} />
        ))}
      </div>
    </li>
  );
}

export function InstallSection(): ReactElement {
  const installMethod = usePreferencesStore((state) => state.installMethod);
  const setInstallMethod = usePreferencesStore(
    (state) => state.setInstallMethod,
  );
  const active = INSTALL_METHOD_TABS[installMethod];

  const headingId = useId();

  const handleValueChange = useCallback(
    (value: unknown): void => {
      if (isInstallMethod(value)) {
        setInstallMethod(value);
      }
    },
    [setInstallMethod],
  );

  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the in-page anchor the hero links to; the section renders once.
    <section
      aria-labelledby={headingId}
      className="mx-auto flex max-w-300 scroll-mt-header flex-wrap items-start gap-5 px-4 pt-14 pb-10 sm:px-6 md:gap-12 md:pt-24 md:pb-24"
      id="install"
    >
      <div className="min-w-0 flex-[1_1_320px]">
        <p className="font-bold font-mono text-xs uppercase tracking-[0.08em] md:text-sm">
          01 — Install
        </p>
        <h2
          className="mt-2 text-[32px] leading-[1.05] tracking-[-0.03em] md:mt-3 md:text-5xl md:leading-none"
          id={headingId}
        >
          Two ways in.
        </h2>
        <p className="mt-3 text-base text-muted-foreground leading-normal md:mt-5 md:text-lg md:leading-[1.55]">
          Add the marketplace in Claude Code and install the plugins you need,
          or pull single plugins with the Vercel skills CLI.
        </p>
        <p className="mt-4 hidden text-base text-muted-foreground leading-[1.55] md:block">
          Your choice sticks: the plugin cards show commands for the same
          method.
        </p>
      </div>

      <div className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-xl border-3 border-edge bg-secondary-background shadow-shadow-lg md:shadow-shadow-xl">
        <Tabs onValueChange={handleValueChange} value={installMethod}>
          <TabsList
            aria-label="Install method"
            className="grid h-auto w-full grid-cols-2 gap-2 rounded-none border-0 border-edge border-b-3 bg-background p-2.5 md:flex md:flex-wrap md:justify-start md:gap-2.5 md:p-3.5"
          >
            {INSTALL_METHODS.map((id) => (
              <TabsTrigger
                className="h-11 min-w-0 border-edge bg-secondary-background px-2 text-[15px] text-foreground focus-visible:ring-offset-background data-active:border-border data-active:bg-main data-active:text-main-foreground data-active:shadow-shadow-sm md:px-4.5"
                key={id}
                value={id}
              >
                <span className="md:hidden">
                  {INSTALL_METHOD_TABS[id].shortLabel}
                </span>
                <span className="hidden md:inline">
                  {INSTALL_METHOD_TABS[id].label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          {INSTALL_METHODS.map((id) => (
            <TabsContent
              className="mt-0 p-3.5 focus-visible:ring-inset focus-visible:ring-offset-0 md:p-5"
              key={id}
              value={id}
            >
              <ol className="flex flex-col gap-3.5 md:gap-4.5">
                {INSTALL_METHOD_TABS[id].steps.map((step, index) => (
                  <Step key={step.title} number={index + 1} step={step} />
                ))}
              </ol>
            </TabsContent>
          ))}
        </Tabs>
        <p className="border-edge border-t-3 bg-plugin-review px-3.5 py-3 text-[13px] text-main-foreground leading-normal md:px-5 md:py-3.5 md:text-sm">
          {active.note}
        </p>
      </div>
    </section>
  );
}
