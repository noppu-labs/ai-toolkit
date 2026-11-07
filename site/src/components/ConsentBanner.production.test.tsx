import { afterEach, describe, expect, it, vi } from "vitest";
import { type Locator, page } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  type ConsentChoice,
  getConsentChoice,
  startAnalytics,
  stopAnalytics,
} from "@/lib/analytics";
import { useConsentStore } from "@/stores/useConsentStore";
import { ConsentBanner } from "./ConsentBanner.tsx";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  getConsentChoice: vi.fn((_cookies: string): ConsentChoice | null => null),
  isAnalyticsHost: (): boolean => true,
  startAnalytics: vi.fn<() => void>(),
  stopAnalytics: vi.fn<() => void>(),
}));

function banner(): Locator {
  return page.getByRole("region", {
    name: /count this visit|cookie settings/i,
  });
}

function fireReturn(eventName: string): void {
  const target = eventName === "pageshow" ? window : document;
  target.dispatchEvent(new Event(eventName));
}

afterEach(() => {
  vi.mocked(getConsentChoice).mockReset();
  vi.mocked(startAnalytics).mockReset();
  vi.mocked(stopAnalytics).mockReset();
  useConsentStore.setState(useConsentStore.getInitialState(), true);
});

describe("ConsentBanner on the production host", () => {
  it("stops listening for the visitor's return once unmounted", async () => {
    const { unmount } = await render(<ConsentBanner />);
    const onMount = vi.mocked(stopAnalytics).mock.calls.length;

    fireReturn("pageshow");
    fireReturn("visibilitychange");

    const whileMounted = vi.mocked(stopAnalytics).mock.calls.length;
    expect(whileMounted).toBeGreaterThanOrEqual(onMount + 2);

    await unmount();
    fireReturn("pageshow");
    fireReturn("visibilitychange");

    expect(vi.mocked(stopAnalytics)).toHaveBeenCalledTimes(whileMounted);
  });

  it.each(["visibilitychange", "pageshow"])(
    "closes the prompt and starts the tag on %s once another tab allows it",
    async (eventName) => {
      await render(<ConsentBanner />);
      await expect.element(banner()).toBeVisible();
      vi.mocked(getConsentChoice).mockReturnValue("granted");

      fireReturn(eventName);

      await expect.element(banner()).not.toBeInTheDocument();
      expect(vi.mocked(startAnalytics)).toHaveBeenCalledOnce();
    },
  );

  it("keeps the prompt while the visitor still has not answered", async () => {
    await render(<ConsentBanner />);
    await expect.element(banner()).toBeVisible();

    fireReturn("pageshow");

    expect(useConsentStore.getState().panel).toBe("prompt");
    expect(vi.mocked(startAnalytics)).not.toHaveBeenCalled();
  });

  it("keeps the settings the visitor opened when they return", async () => {
    vi.mocked(getConsentChoice).mockReturnValue("denied");
    useConsentStore.getState().openSettings();
    await render(<ConsentBanner />);
    await expect.element(banner()).toBeVisible();
    vi.mocked(getConsentChoice).mockReturnValue("granted");

    fireReturn("pageshow");

    expect(useConsentStore.getState().panel).toBe("settings");
    expect(vi.mocked(startAnalytics)).toHaveBeenCalledOnce();
  });
});
