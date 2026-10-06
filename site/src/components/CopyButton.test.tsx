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
    render(<CopyButton aria-label="Copy" content="x" resetAfter={50} />);

    const button = page.getByRole("button", { name: "Copy" });
    await button.click();
    await expect.element(button).toHaveAttribute("data-copied", "true");
    await expect.element(button).toHaveAttribute("data-copied", "false");
  });
});
