import { useSyncExternalStore } from "react";
import { readPluginParam, subscribeToUrl } from "@/lib/url-state";

export function usePluginParam(): string | null {
  return useSyncExternalStore(subscribeToUrl, readPluginParam);
}
