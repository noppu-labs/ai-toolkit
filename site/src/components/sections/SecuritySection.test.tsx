import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { SecuritySection } from "./SecuritySection.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SecuritySection", () => {
  it("shows and copies the attestation verify command", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<SecuritySection />);

    await expect.element(page.getByText(/gh attestation verify/)).toBeVisible();
    await page.getByRole("button", { name: "Copy verify command" }).click();
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      "gh attestation verify <plugin>-<version>.tgz --repo noppu-labs/ai-toolkit",
    );
  });

  it("links to the security policy and Scorecard", async () => {
    render(<SecuritySection />);

    await expect
      .element(page.getByRole("link", { name: "Security policy" }))
      .toHaveAttribute(
        "href",
        "https://github.com/noppu-labs/ai-toolkit/blob/main/SECURITY.md",
      );
    await expect
      .element(page.getByRole("link", { name: "OpenSSF Scorecard" }))
      .toHaveAttribute(
        "href",
        "https://scorecard.dev/viewer/?uri=github.com/noppu-labs/ai-toolkit",
      );
    await expect
      .element(page.getByRole("link", { name: "Release attestations" }))
      .toHaveAttribute(
        "href",
        "https://github.com/noppu-labs/ai-toolkit/attestations",
      );
  });
});
