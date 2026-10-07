import { useSyncExternalStore } from "react";
import { readPluginParam, subscribeToUrl } from "@/lib/url-state";

/** The `?plugin=` filter in the URL, followed live; `null` when unset. */
export function usePluginParam(): string | null {
  return useSyncExternalStore(subscribeToUrl, readPluginParam);
}
