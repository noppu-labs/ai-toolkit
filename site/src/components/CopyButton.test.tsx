import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CopyButton } from "./CopyButton.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CopyButton", () => {
  it("copies its content and shows the copied state", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(
      <CopyButton
        aria-label="Copy command"
        content="npm i"
        label="Copy"
        resetAfter={60_000}
      />,
    );

    const button = page.getByRole("button", { name: "Copy command" });
    await expect.element(button).toHaveTextContent("Copy");
    await button.click();

    expect(writeText).toHaveBeenCalledWith("npm i");
    await expect.element(button).toHaveAttribute("data-copied", "true");
    await expect
      .element(page.getByText("Copied", { exact: true }))
      .toBeVisible();
  });

  it("returns to the idle state after the reset delay", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<CopyButton aria-label="Copy" content="x" resetAfter={500} />);

    const button = page.getByRole("button", { name: "Copy" });
    await button.click();
    await expect.element(button).toHaveAttribute("data-copied", "true");
    await expect
      .element(button, { timeout: 2000 })
      .toHaveAttribute("data-copied", "false");
  });

  it("restarts the reset delay on a second copy", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    render(<CopyButton aria-label="Copy" content="x" resetAfter={600} />);
    const button = page.getByRole("button", { name: "Copy" });

    await button.click();
    await expect.element(button).toHaveAttribute("data-copied", "true");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await button.click();
    await new Promise((resolve) => setTimeout(resolve, 400));

    // 800 ms after the first copy, 400 ms after the second.
    expect(button.element().getAttribute("data-copied")).toBe("true");
    await expect
      .element(button, { timeout: 2000 })
      .toHaveAttribute("data-copied", "false");
  });

  it("logs instead of throwing when the clipboard API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Silenced: the call is asserted below.
    });
    try {
      render(<CopyButton aria-label="Copy" content="x" />);
      const button = page.getByRole("button", { name: "Copy" });
      await button.click();

      await expect.poll(() => consoleError.mock.calls.length).toBe(1);
      await expect.element(button).toHaveAttribute("data-copied", "false");
    } finally {
      // Deleting the own property restores the prototype getter.
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});
