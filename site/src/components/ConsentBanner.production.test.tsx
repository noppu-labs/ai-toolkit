import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Locator, page } from "vitest/browser";
import { render } from "vitest-browser-react";
import {
  type ConsentMode,
  fetchConsentMode,
  startAnalytics,
  stopAnalytics,
} from "@/lib/analytics";
import { useConsentStore } from "@/stores/useConsentStore";
import {
  type ConsentChoice,
  getConsentChoice,
} from "../../worker/consent-cookie.ts";
import { ConsentBanner } from "./ConsentBanner.tsx";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  fetchConsentMode: vi.fn(async (): Promise<ConsentMode> => "opt-in"),
  startAnalytics: vi.fn<() => void>(),
  stopAnalytics: vi.fn<() => void>(),
}));

vi.mock("../../worker/consent-cookie.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../worker/consent-cookie.ts")>()),
  getConsentChoice: vi.fn((_cookies: string): ConsentChoice | null => null),
  isAnalyticsHost: (): boolean => true,
}));

function banner(): Locator {
  return page.getByRole("region", {
    name: /count (this visit|visits)|cookie settings/i,
  });
}

function fireReturn(eventName: string): void {
  const target = eventName === "pageshow" ? window : document;
  target.dispatchEvent(new Event(eventName));
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(fetchConsentMode).mockReset();
  vi.mocked(fetchConsentMode).mockResolvedValue("opt-in");
  vi.mocked(getConsentChoice).mockReset();
  vi.mocked(startAnalytics).mockReset();
  vi.mocked(stopAnalytics).mockReset();
  useConsentStore.setState(useConsentStore.getInitialState(), true);
});

describe("ConsentBanner on the production host", () => {
  it("stops listening for the visitor's return once unmounted", async () => {
    const { unmount } = await render(<ConsentBanner />);
    await expect.element(banner()).toBeVisible();
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

  it("starts the tag for a visitor who has not answered outside the opt-in regions, and tells them", async () => {
    vi.mocked(fetchConsentMode).mockResolvedValue("opt-out");

    await render(<ConsentBanner />);

    await expect
      .element(banner().getByRole("button", { name: "Opt out" }))
      .toBeVisible();
    expect(vi.mocked(startAnalytics)).toHaveBeenCalledOnce();
    expect(vi.mocked(stopAnalytics)).not.toHaveBeenCalled();
  });

  it("stops the tag for a visitor who has not answered in an opt-in region, and asks them", async () => {
    await render(<ConsentBanner />);

    await expect
      .element(banner().getByRole("button", { name: "Allow analytics" }))
      .toBeVisible();
    expect(vi.mocked(stopAnalytics)).toHaveBeenCalled();
    expect(vi.mocked(startAnalytics)).not.toHaveBeenCalled();
  });

  it("neither starts nor stops anything for a visitor who has not answered until the mode is known", async () => {
    const pending = Promise.withResolvers<ConsentMode>();
    vi.mocked(fetchConsentMode).mockReturnValue(pending.promise);

    await render(<ConsentBanner />);
    fireReturn("pageshow");

    expect(vi.mocked(startAnalytics)).not.toHaveBeenCalled();
    expect(vi.mocked(stopAnalytics)).not.toHaveBeenCalled();
    expect(useConsentStore.getState().panel).toBe("closed");

    pending.resolve("opt-out");

    await expect.element(banner()).toBeVisible();
    expect(vi.mocked(startAnalytics)).toHaveBeenCalledOnce();
  });

  it("asks a returning visitor who only acknowledged the notice in an opt-in region, and keeps the tag off", async () => {
    vi.mocked(getConsentChoice).mockReturnValue("acknowledged");

    await render(<ConsentBanner />);

    await expect
      .element(banner().getByRole("button", { name: "Allow analytics" }))
      .toBeVisible();
    expect(vi.mocked(stopAnalytics)).toHaveBeenCalled();
    expect(vi.mocked(startAnalytics)).not.toHaveBeenCalled();
  });

  it("starts the tag for a returning visitor who acknowledged the notice in an opt-out region, without asking", async () => {
    vi.mocked(getConsentChoice).mockReturnValue("acknowledged");
    vi.mocked(fetchConsentMode).mockResolvedValue("opt-out");

    await render(<ConsentBanner />);

    await vi.waitFor(() =>
      expect(vi.mocked(startAnalytics)).toHaveBeenCalled(),
    );
    expect(useConsentStore.getState().panel).toBe("closed");
  });

  it("starts the tag for a returning visitor who allowed it without waiting for the mode", async () => {
    vi.mocked(getConsentChoice).mockReturnValue("granted");
    vi.mocked(fetchConsentMode).mockReturnValue(new Promise(() => undefined));

    await render(<ConsentBanner />);

    expect(vi.mocked(startAnalytics)).toHaveBeenCalledOnce();
  });
});
