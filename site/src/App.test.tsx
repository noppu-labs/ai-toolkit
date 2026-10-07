import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import App from "./App.tsx";

function onScreen(element: Element): boolean {
  const { right, left } = element.getBoundingClientRect();
  return right > 0 && left < window.innerWidth;
}

describe("App", () => {
  it("offers a skip link to the main content, shown when focused", async () => {
    render(<App />);

    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect.element(skip).toHaveAttribute("href", "#main");
    await expect.element(page.getByRole("main")).toHaveAttribute("id", "main");
    expect(onScreen(skip.element())).toBe(false);

    await userEvent.tab();

    await expect.element(skip).toHaveFocus();
    expect(onScreen(skip.element())).toBe(true);
  });
});
