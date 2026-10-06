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

  it("is a section labelled by its heading", async () => {
    render(<SecuritySection />);

    await expect
      .element(page.getByRole("region", { name: "Every release is attested." }))
      .toHaveAttribute("id", "security");
  });

  it("links the project health chips", async () => {
    render(<SecuritySection />);

    const health = page.getByRole("list", { name: "Project health" });
    await expect.element(health).toBeVisible();
    const links = health
      .getByRole("link")
      .elements()
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      [
        "tests",
        "https://github.com/noppu-labs/ai-toolkit/actions/workflows/tests.yml",
      ],
      [
        "fuzz",
        "https://github.com/noppu-labs/ai-toolkit/actions/workflows/fuzz.yml",
      ],
      [
        "build",
        "https://github.com/noppu-labs/ai-toolkit/actions/workflows/release.yml",
      ],
      [
        "OpenSSF Best Practices",
        "https://www.bestpractices.dev/projects/13473",
      ],
      [
        "OpenSSF Baseline",
        "https://www.bestpractices.dev/projects/13473/baseline-1",
      ],
      ["Snyk", "https://snyk.io/test/github/noppu-labs/ai-toolkit"],
    ]);
  });
});
