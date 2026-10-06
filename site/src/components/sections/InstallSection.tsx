import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useId,
  useState,
} from "react";
import { CopyButton } from "@/components/CopyButton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PLUGINS = ["review", "investigate", "laravel", "inertia-react"] as const;

type InstallMethodId = "claude-code" | "skills-cli";

interface InstallMethod {
  id: InstallMethodId;
  label: string;
  copyLabel: string;
  commands: readonly string[];
  note: ReactNode;
}

const CLAUDE_CODE: InstallMethod = {
  id: "claude-code",
  label: "Claude Code marketplace",
  copyLabel: "Copy Claude Code install commands",
  commands: [
    "/plugin marketplace add noppu-labs/ai-toolkit",
    ...PLUGINS.map((plugin) => `/plugin install ${plugin}@ai-toolkit`),
    "/laravel:install-rules",
    "/inertia-react:install-rules",
  ],
  note: (
    <>
      The install-rules commands copy each plugin’s path-scoped rules into your
      project’s <code className="font-mono">.claude/rules/</code>. Review them
      afterwards.
    </>
  ),
};

const SKILLS_CLI: InstallMethod = {
  id: "skills-cli",
  label: "Vercel skills CLI",
  copyLabel: "Copy skills CLI commands",
  commands: PLUGINS.map(
    (plugin) => `npx skills add noppu-labs/ai-toolkit/${plugin}`,
  ),
  note: (
    <>
      <code className="font-mono">{`\${CLAUDE_PLUGIN_ROOT}`}</code> is not set
      on this route, so investigate’s script paths need replacing after install.
    </>
  ),
};

const INSTALL_METHODS: readonly InstallMethod[] = [CLAUDE_CODE, SKILLS_CLI];

export function InstallSection(): ReactElement {
  const [active, setActive] = useState<InstallMethod>(CLAUDE_CODE);

  const headingId = useId();

  const handleValueChange = useCallback((value: unknown): void => {
    const method = INSTALL_METHODS.find((candidate) => candidate.id === value);
    if (method !== undefined) {
      setActive(method);
    }
  }, []);

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
          <code className="rounded-sm border-2 border-border bg-secondary-background px-1.5 py-0.5 font-mono text-foreground text-sm">
            review:comment-audit
          </code>
          .
        </p>
      </div>

      <div className="min-w-0 flex-[999_1_600px] overflow-hidden rounded-xl border-3 border-border bg-secondary-background shadow-shadow-xl">
        <Tabs onValueChange={handleValueChange} value={active.id}>
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-border border-b-3 bg-background p-3.5">
            <TabsList
              aria-label="Install method"
              className="h-auto flex-wrap justify-start gap-2.5 border-0 bg-transparent p-0"
            >
              {INSTALL_METHODS.map((method) => (
                <TabsTrigger
                  className="h-11 border-border bg-secondary-background px-4 text-[15px] text-foreground focus-visible:ring-offset-background data-active:bg-main data-active:text-main-foreground data-active:shadow-shadow-md"
                  key={method.id}
                  value={method.id}
                >
                  {method.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <CopyButton
              aria-label={active.copyLabel}
              className="h-11 px-3.5 font-heading text-[15px] shadow-shadow-md focus-visible:ring-offset-background"
              content={active.commands.join("\n")}
              copiedLabel="Copied!"
              key={active.id}
              label="Copy"
            />
          </div>
          {INSTALL_METHODS.map((method) => (
            <TabsContent
              className="mt-0 overflow-x-auto bg-terminal px-6 pt-6 pb-7 focus-visible:ring-inset focus-visible:ring-offset-0"
              key={method.id}
              value={method.id}
            >
              <ul className="font-mono text-[15px] text-terminal-foreground leading-loose">
                {method.commands.map((command) => (
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
