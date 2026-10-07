import { REPO_SLUG } from "@/lib/repo";
import type { InstallMethod } from "@/stores/usePreferencesStore";

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
