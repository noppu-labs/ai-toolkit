/** The catalog's plugin filter, as `?plugin=<name>`, so a filtered view can be linked to. */
export const PLUGIN_PARAM = "plugin";
/** The catalog's search text, as `?q=<text>`. */
export const QUERY_PARAM = "q";
/** The skill the catalog shows in detail, as `?skill=<name>`. */
export const SKILL_PARAM = "skill";

/** Fired on `window` when this module changes the URL; `history` methods fire nothing themselves. */
const URL_CHANGE_EVENT = "ai-toolkit:urlchange";

/** A write the browser refused, and the address it was made from: the page follows it while that address stays. */
let refused: { from: string; to: string } | null = null;

/** The URL the page follows: the last one this module asked for, even when the browser refused it. */
function currentHref(): string {
  const href = window.location.href;
  return refused !== null && refused.from === href ? refused.to : href;
}

export function readSearchParam(name: string): string | null {
  return new URL(currentHref()).searchParams.get(name);
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
  /** The history entry's state; the current one is kept when unset. */
  state?: unknown;
}

/**
 * Sets search parameters in the URL (`null` or `""` removes one), leaving
 * every other parameter alone. Replaces the history entry unless `push` is set,
 * so filtering and selecting do not fill the back button's history.
 */
export function writeSearchParams(
  params: Readonly<Record<string, string | null>>,
  { push = false, hash, state = window.history.state }: WriteUrlOptions = {},
): void {
  const current = currentHref();
  const url = new URL(current);
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
  if (url.href === current) {
    return;
  }
  try {
    if (push) {
      window.history.pushState(state, "", url);
    } else {
      window.history.replaceState(state, "", url);
    }
    refused = null;
  } catch {
    // Safari throws when a page rewrites its URL too often. The page follows the change anyway;
    // the next write the browser accepts carries it into the address bar.
    refused = { from: window.location.href, to: url.href };
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

/**
 * What following a plugin's skills link does in page: filter the catalog to
 * the plugin. It also clears the query, which could hide every skill of the
 * plugin, and the selected skill, which could sit outside the new filter.
 */
export function showPluginSkills(plugin: string): void {
  writeSearchParams(
    { [PLUGIN_PARAM]: plugin, [QUERY_PARAM]: null, [SKILL_PARAM]: null },
    { push: true, hash: "skills" },
  );
}
