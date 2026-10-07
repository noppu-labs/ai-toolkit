import { type ReactElement, type ReactNode, useCallback, useId } from "react";
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

interface InstallMethodTab {
  label: string;
  copyLabel: string;
  commands: readonly string[];
  note: ReactNode;
}

const INSTALL_METHOD_TABS: Record<InstallMethod, InstallMethodTab> = {
  "claude-code": {
    label: "Claude Code marketplace",
    copyLabel: "Copy Claude Code install commands",
    commands: [
      `/plugin marketplace add ${REPO_SLUG}`,
      ...PLUGIN_ORDER.map((plugin) => `/plugin install ${plugin}@ai-toolkit`),
      "/laravel:install-rules",
      "/inertia-react:install-rules",
    ],
    note: (
      <>
        The install-rules commands copy each plugin’s path-scoped rules into
        your project’s <code className="font-mono">.claude/rules/</code>. Review
        them afterwards.
      </>
    ),
  },
  "skills-cli": {
    label: "Vercel skills CLI",
    copyLabel: "Copy skills CLI commands",
    commands: PLUGIN_ORDER.map(
      (plugin) => `npx skills add ${REPO_SLUG}/${plugin}`,
    ),
    note: (
      <>
        <code className="font-mono">{`\${CLAUDE_PLUGIN_ROOT}`}</code> is not set
        on this route, so investigate’s script paths need replacing after
        install.
      </>
    ),
  },
};

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
      className="mx-auto flex max-w-300 scroll-mt-24 flex-wrap items-start gap-12 px-4 pt-28 pb-24 sm:px-6"
      id="install"
    >
      <div className="min-w-0 flex-[1_1_320px]">
        <p className="font-bold font-mono text-sm uppercase tracking-[0.08em]">
          01 — Install
        </p>
        <h2
          className="mt-3 text-5xl leading-none tracking-[-0.03em]"
          id={headingId}
        >
          Two ways in.
        </h2>
        <p className="mt-5 text-lg text-muted-foreground leading-[1.55]">
          Add the marketplace in Claude Code and install the plugins you need,
          or pull single plugins with the Vercel skills CLI.
        </p>
        <p className="mt-4 text-base text-muted-foreground leading-[1.55]">
          Skills are namespaced after install, e.g.{" "}
          <code className="rounded-sm border-2 border-edge bg-secondary-background px-1.5 py-0.5 font-mono text-foreground text-sm">
            review:comment-audit
          </code>
          .
        </p>
      </div>

      <div className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-xl border-3 border-edge bg-secondary-background shadow-shadow-xl">
        <Tabs onValueChange={handleValueChange} value={installMethod}>
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-edge border-b-3 bg-background p-3.5">
            <TabsList
              aria-label="Install method"
              className="h-auto flex-wrap justify-start gap-2.5 border-0 bg-transparent p-0"
            >
              {INSTALL_METHODS.map((id) => (
                <TabsTrigger
                  className="h-11 border-edge bg-secondary-background px-4 text-[15px] text-foreground focus-visible:ring-offset-background data-active:border-border data-active:bg-main data-active:text-main-foreground data-active:shadow-shadow-md"
                  key={id}
                  value={id}
                >
                  {INSTALL_METHOD_TABS[id].label}
                </TabsTrigger>
              ))}
            </TabsList>
            <CopyButton
              aria-label={active.copyLabel}
              className="h-11 px-3.5 font-heading text-[15px] shadow-shadow-md focus-visible:ring-offset-background"
              content={active.commands.join("\n")}
              copiedLabel="Copied!"
              key={installMethod}
              label="Copy"
            />
          </div>
          {INSTALL_METHODS.map((id) => (
            <TabsContent
              className="mt-0 overflow-x-auto bg-terminal px-6 pt-6 pb-7 focus-visible:ring-inset focus-visible:ring-offset-0"
              key={id}
              value={id}
            >
              <ul className="font-mono text-[15px] text-terminal-foreground leading-loose">
                {INSTALL_METHOD_TABS[id].commands.map((command) => (
                  <li className="whitespace-nowrap" key={command}>
                    <span aria-hidden="true" className="mr-3 text-main">
                      ›
                    </span>
                    <code>{command}</code>
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
        <p className="border-border border-t-3 bg-plugin-review px-5 py-3.5 text-main-foreground text-sm leading-normal">
          {active.note}
        </p>
      </div>
    </section>
  );
}
