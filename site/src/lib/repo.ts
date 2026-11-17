export const REPO_SLUG = "noppu-labs/ai-toolkit";
export const REPO_URL = `https://github.com/${REPO_SLUG}`;

/** The catalog build requires a plugin's folder to carry its name. */
export function pluginSourceUrl(plugin: string): string {
  return `${REPO_URL}/tree/main/${plugin}`;
}
