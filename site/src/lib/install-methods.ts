import type { InstallMethod } from "@/stores/usePreferencesStore";
import type { PluginEntry } from "../catalog-types.ts";
import { REPO_SLUG } from "./repo.ts";

/** The `name` in `.claude-plugin/marketplace.json`, which `/plugin install` takes after the `@`. */
const MARKETPLACE_NAME = "ai-toolkit";

interface InstallMethodLabel {
  /** On phones. */
  short: string;
  /** From `md`. */
  long: string;
}

/** Keyed by every method, so adding one to the store fails to compile until it is labelled. */
export const INSTALL_METHOD_LABELS: Readonly<
  Record<InstallMethod, InstallMethodLabel>
> = {
  "claude-code": { short: "Claude Code", long: "Claude Code marketplace" },
  "skills-cli": { short: "skills CLI", long: "Vercel skills CLI" },
};

export const MARKETPLACE_ADD_COMMAND = `/plugin marketplace add ${REPO_SLUG}`;

export function pluginInstallCommand(
  plugin: string,
  method: InstallMethod,
): string {
  switch (method) {
    case "claude-code":
      return `/plugin install ${plugin}@${MARKETPLACE_NAME}`;
    case "skills-cli":
      return `npx skills add ${REPO_SLUG}/${plugin}`;
  }
}

export function otherInstallMethod(method: InstallMethod): InstallMethod {
  return method === "claude-code" ? "skills-cli" : "claude-code";
}

export function opencodeInstallCommand(pkg: string): string {
  return `opencode plugin add ${pkg}`;
}

/** One tab of a plugin page's install box. */
export interface InstallHost {
  label: string;
  commands: string[];
}

/** Claude Code and the skills CLI for every plugin, OpenCode when the plugin has a package. */
export function pluginInstallHosts(
  plugin: Pick<PluginEntry, "name" | "opencodePackage">,
): InstallHost[] {
  const hosts: InstallHost[] = [
    {
      label: INSTALL_METHOD_LABELS["claude-code"].short,
      commands: [
        MARKETPLACE_ADD_COMMAND,
        pluginInstallCommand(plugin.name, "claude-code"),
      ],
    },
    {
      label: INSTALL_METHOD_LABELS["skills-cli"].short,
      commands: [pluginInstallCommand(plugin.name, "skills-cli")],
    },
  ];
  if (plugin.opencodePackage !== undefined) {
    hosts.push({
      label: "OpenCode",
      commands: [opencodeInstallCommand(plugin.opencodePackage)],
    });
  }

  return hosts;
}

export interface CommandStep {
  /** The glyph before the command: a step number, or the prompt. */
  marker: string;
  command: string;
  copyLabel: string;
  /** For the step every plugin shares. */
  muted?: boolean;
}

/** Shared by the plugin cards and the skill detail, so both show and copy the same commands. */
export function pluginInstallSteps(
  plugin: string,
  method: InstallMethod,
): CommandStep[] {
  const install = pluginInstallCommand(plugin, method);
  switch (method) {
    case "claude-code":
      return [
        {
          marker: "1",
          command: MARKETPLACE_ADD_COMMAND,
          copyLabel: `Copy step 1 for ${plugin}: add the marketplace`,
          muted: true,
        },
        {
          marker: "2",
          command: install,
          copyLabel: `Copy step 2 for ${plugin}: install it`,
        },
      ];
    case "skills-cli":
      return [
        {
          marker: "›",
          command: install,
          copyLabel: `Copy the install command for ${plugin}`,
        },
      ];
  }
}
