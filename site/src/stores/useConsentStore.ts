import { create } from "zustand";

/** `prompt` asks a new visitor without taking focus; `settings` answers a click, so it takes focus. */
export type ConsentPanel = "closed" | "prompt" | "settings";

interface ConsentStore {
  panel: ConsentPanel;
  openPrompt: () => void;
  openSettings: () => void;
  closePanel: () => void;
}

/** Shared between islands: the footer and the privacy page open the banner, which hydrates on its own. */
export const useConsentStore = create<ConsentStore>()((set) => ({
  panel: "closed",
  openPrompt: (): void => {
    set({ panel: "prompt" });
  },
  openSettings: (): void => {
    set({ panel: "settings" });
  },
  closePanel: (): void => {
    set({ panel: "closed" });
  },
}));
