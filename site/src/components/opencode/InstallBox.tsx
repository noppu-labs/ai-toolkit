import { Tabs } from "@base-ui/react/tabs";
import { type ReactElement, useCallback } from "react";
import { CommandLine } from "@/components/CommandText";
import { CopyButton } from "@/components/CopyButton";
import { cn } from "@/lib/utils";
import { InlineText } from "./InlineText.tsx";

interface InstallHost {
  label: string;
  commands: string[];
  note?: string | undefined;
}

interface InstallBoxProps {
  /** The plugin's name, for the Copy buttons' labels. */
  plugin: string;
  hosts: InstallHost[];
  /** Under every host's commands. */
  note?: string | undefined;
  /** The plugin's accent, a `bg-*` class, for the selected host's tab. */
  accentClass: string;
}

// The box stays dark in both themes, so text and focus rings are light on it.
const FOCUS_ON_TERMINAL =
  "outline-hidden focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-terminal";

const TAB_CLASSES =
  "inline-flex h-9 cursor-pointer items-center rounded-base border-2 border-border px-3 text-sm font-heading whitespace-nowrap text-black transition-all";

const NOTE_CLASSES =
  "text-[13px] leading-normal text-terminal-foreground/75 md:text-sm";

function copyLabel(plugin: string, host: InstallHost, index: number): string {
  const label = `Copy the ${host.label} install command for ${plugin}`;
  return host.commands.length > 1 ? `${label} (step ${index + 1})` : label;
}

function HostCommands({
  plugin,
  host,
}: {
  plugin: string;
  host: InstallHost;
}): ReactElement {
  const numbered = host.commands.length > 1;
  return (
    <>
      {/* A Copy button per command: each one runs on its own. */}
      <ol className="flex flex-col gap-2 rounded-base border-2 border-terminal-foreground/20 px-3 py-2 text-[12.5px] leading-[1.55] text-terminal-foreground md:px-3.5 md:py-2.5 md:text-sm md:leading-[1.6]">
        {host.commands.map((command, index) => (
          <li className="flex items-center gap-2.5 md:gap-3" key={command}>
            <CommandLine
              className="min-w-0 flex-1"
              command={command}
              marker={numbered ? index + 1 : undefined}
            />
            <CopyButton
              aria-label={copyLabel(plugin, host, index)}
              className="h-9 shrink-0 border-border bg-white px-2.5 text-[13px] font-heading text-black shadow-none hover:translate-x-0 hover:translate-y-0 focus-visible:ring-offset-terminal [&>svg]:hidden"
              content={command}
              copiedLabel="Copied!"
              label="Copy"
            />
          </li>
        ))}
      </ol>
      {host.note === undefined ? null : (
        <p className={cn("mt-2.5", NOTE_CLASSES)}>
          <InlineText text={host.note} />
        </p>
      )}
    </>
  );
}

function HostTabs({
  plugin,
  hosts,
  accentClass,
}: {
  plugin: string;
  hosts: InstallHost[];
  accentClass: string;
}): ReactElement {
  // Base UI knows which tab is active, so the accent follows it with no state of our own.
  const tabClassName = useCallback(
    ({ active }: Tabs.Tab.State): string =>
      cn(
        TAB_CLASSES,
        FOCUS_ON_TERMINAL,
        active ? cn(accentClass, "shadow-shadow-sm") : "bg-white",
      ),
    [accentClass],
  );

  return (
    <Tabs.Root defaultValue={hosts[0]?.label}>
      <Tabs.List aria-label="Install on" className="flex flex-wrap gap-2">
        {hosts.map((host) => (
          <Tabs.Tab
            className={tabClassName}
            key={host.label}
            value={host.label}
          >
            {host.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {/* Mounted while hidden, so every host's commands are in the HTML for crawlers and visitors without JavaScript. */}
      {hosts.map((host) => (
        <Tabs.Panel
          className={cn("mt-3 rounded-base", FOCUS_ON_TERMINAL)}
          keepMounted
          key={host.label}
          value={host.label}
        >
          <HostCommands host={host} plugin={plugin} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

/** A plugin's install commands, with a tab per host when there is more than one. */
export function InstallBox({
  plugin,
  hosts,
  note,
  accentClass,
}: InstallBoxProps): ReactElement {
  const [only] = hosts;
  return (
    <div className="w-full max-w-160 rounded-xl border-3 border-edge bg-terminal p-3 shadow-shadow-lg md:p-3.5">
      {hosts.length === 1 && only !== undefined ? (
        <HostCommands host={only} plugin={plugin} />
      ) : (
        <HostTabs accentClass={accentClass} hosts={hosts} plugin={plugin} />
      )}
      {note === undefined ? null : (
        <p className={cn("mt-3", NOTE_CLASSES)}>
          <InlineText text={note} />
        </p>
      )}
    </div>
  );
}
