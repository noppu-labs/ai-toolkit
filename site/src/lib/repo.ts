export const REPO_SLUG = "noppu-labs/ai-toolkit";
export const REPO_URL = `https://github.com/${REPO_SLUG}`;

/** The plugin's directory on the default branch. */
export function pluginSourceUrl(plugin: string): string {
  return `${REPO_URL}/tree/main/${plugin}`;
}
