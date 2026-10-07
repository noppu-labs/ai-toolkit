import { useCallback, useSyncExternalStore } from "react";
import { readSearchParam, subscribeToUrl } from "@/lib/url-state";

/** A search parameter of the URL (`?plugin=`, `?skill=`), followed live; `null` when unset. */
export function useSearchParam(name: string): string | null {
  const read = useCallback((): string | null => readSearchParam(name), [name]);
  return useSyncExternalStore(subscribeToUrl, read);
}
