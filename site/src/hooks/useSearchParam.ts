import { useCallback, useSyncExternalStore } from "react";
import { readSearchParam, subscribeToUrl } from "@/lib/url-state";

export function useSearchParam(name: string): string | null {
  const read = useCallback((): string | null => readSearchParam(name), [name]);
  return useSyncExternalStore(subscribeToUrl, read);
}
