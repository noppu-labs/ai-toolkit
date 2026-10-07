/** The catalog's plugin filter, as `?plugin=<name>`, so a filtered view can be linked to. */
export const PLUGIN_PARAM = "plugin";
/** The catalog's search text, as `?q=<text>`. */
export const QUERY_PARAM = "q";
/** The skill the catalog shows in detail, as `?skill=<name>`. */
export const SKILL_PARAM = "skill";

/** Fired on `window` when this module changes the URL; `history` methods fire nothing themselves. */
const URL_CHANGE_EVENT = "ai-toolkit:urlchange";

/** Fired on `window` by `showPluginSkills`, so the catalog can drop a text query that would hide them. */
const PLUGIN_LINK_EVENT = "ai-toolkit:pluginlink";

/** A search parameter of the current URL, or `null` when it is absent. */
export function readSearchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function readPluginParam(): string | null {
  return readSearchParam(PLUGIN_PARAM);
}

export function pluginSkillsHref(plugin: string): string {
  const params = new URLSearchParams({ [PLUGIN_PARAM]: plugin });
  return `?${params.toString()}#skills`;
}

interface WriteUrlOptions {
  /** A new history entry (a navigation the visitor can go back from) rather than replacing the current one. */
  push?: boolean;
  /** The fragment to put in the URL, without `#`; the current one is kept when unset. */
  hash?: string;
}

/**
 * Sets search parameters in the URL (`null` or `""` removes one), leaving
 * every other parameter alone. Replaces the history entry unless `push` is set,
 * so filtering and selecting do not fill the back button's history.
 */
export function writeSearchParams(
  params: Readonly<Record<string, string | null>>,
  { push = false, hash }: WriteUrlOptions = {},
): void {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(params)) {
    if (value === null || value === "") {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, value);
    }
  }
  if (hash !== undefined) {
    url.hash = hash;
  }
  if (url.href === window.location.href) {
    return;
  }
  try {
    if (push) {
      window.history.pushState(window.history.state, "", url);
    } else {
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    // Safari throws when a page rewrites its URL too often; the URL then lags until the next write.
    return;
  }
  window.dispatchEvent(new Event(URL_CHANGE_EVENT));
}

/** Sets the plugin filter in the URL (`null` removes it), leaving every other parameter alone. */
export function writePluginParam(
  plugin: string | null,
  options: WriteUrlOptions = {},
): void {
  writeSearchParams({ [PLUGIN_PARAM]: plugin }, options);
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
