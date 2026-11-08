import { create } from "zustand";
import type { ConsentMode } from "@/lib/analytics";

/** `prompt` asks a new visitor without taking focus; `settings` answers a click, so it takes focus. */
export type ConsentPanel = "closed" | "prompt" | "settings";

interface ConsentStore {
  panel: ConsentPanel;
  /** Null until the Worker answers, and on hosts that never ask it. */
  mode: ConsentMode | null;
  openPrompt: () => void;
  openSettings: () => void;
  closePanel: () => void;
  setMode: (mode: ConsentMode) => void;
}

/** Shared between islands: the footer and the privacy page open the banner, which hydrates on its own. */
export const useConsentStore = create<ConsentStore>()((set) => ({
  panel: "closed",
  mode: null,
  openPrompt: (): void => {
    set({ panel: "prompt" });
  },
  openSettings: (): void => {
    set({ panel: "settings" });
  },
  closePanel: (): void => {
    set({ panel: "closed" });
  },
  setMode: (mode: ConsentMode): void => {
    set({ mode });
  },
}));
