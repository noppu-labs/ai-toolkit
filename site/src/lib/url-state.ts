/** The catalog's plugin filter, as `?plugin=<name>`, so a filtered view can be linked to. */
export const PLUGIN_PARAM = "plugin";

/** Fired on `window` when this module changes the URL; `history` methods fire nothing themselves. */
const URL_CHANGE_EVENT = "ai-toolkit:urlchange";

/** Fired on `window` by `showPluginSkills`, so the catalog can drop a text query that would hide them. */
const PLUGIN_LINK_EVENT = "ai-toolkit:pluginlink";

export function readPluginParam(): string | null {
  return new URLSearchParams(window.location.search).get(PLUGIN_PARAM);
}

export function pluginSkillsHref(plugin: string): string {
  const params = new URLSearchParams({ [PLUGIN_PARAM]: plugin });
  return `?${params.toString()}#skills`;
}

interface WritePluginParamOptions {
  /** A new history entry (a navigation the visitor can go back from) rather than replacing the current one. */
  push?: boolean;
  /** The fragment to put in the URL, without `#`; the current one is kept when unset. */
  hash?: string;
}

export function writePluginParam(
  plugin: string | null,
  { push = false, hash }: WritePluginParamOptions = {},
): void {
  const url = new URL(window.location.href);
  if (plugin === null) {
    url.searchParams.delete(PLUGIN_PARAM);
  } else {
    url.searchParams.set(PLUGIN_PARAM, plugin);
  }
  if (hash !== undefined) {
    url.hash = hash;
  }
  if (url.href === window.location.href) {
    return;
  }
  if (push) {
    window.history.pushState(window.history.state, "", url);
  } else {
    window.history.replaceState(window.history.state, "", url);
  }
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

/** Calls `onChange` when the URL changes through this module or the back and forward buttons. */
export function subscribeToUrl(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(URL_CHANGE_EVENT, onChange);
  return (): void => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(URL_CHANGE_EVENT, onChange);
  };
}

/** What following a plugin's skills link does in page: filter the catalog to the plugin and say so. */
export function showPluginSkills(plugin: string): void {
  writePluginParam(plugin, { push: true, hash: "skills" });
  window.dispatchEvent(new Event(PLUGIN_LINK_EVENT));
}

/** Calls `onFollow` when a plugin's skills link is followed in page. */
export function subscribeToPluginLinks(onFollow: () => void): () => void {
  window.addEventListener(PLUGIN_LINK_EVENT, onFollow);
  return (): void => window.removeEventListener(PLUGIN_LINK_EVENT, onFollow);
}
