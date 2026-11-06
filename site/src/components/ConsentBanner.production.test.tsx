import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { stopAnalytics } from "@/lib/analytics";
import { ConsentBanner } from "./ConsentBanner.tsx";

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  getConsentChoice: (): null => null,
  isAnalyticsHost: (): boolean => true,
  stopAnalytics: vi.fn<() => void>(),
}));

describe("ConsentBanner on the production host", () => {
  it("stops listening for the visitor's return once unmounted", async () => {
    const { unmount } = await render(<ConsentBanner />);

    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(vi.mocked(stopAnalytics)).toHaveBeenCalledTimes(3);

    await unmount();
    window.dispatchEvent(new Event("pageshow"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(vi.mocked(stopAnalytics)).toHaveBeenCalledTimes(3);
  });
});
