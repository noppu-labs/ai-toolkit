import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Footer } from "./Footer.tsx";

describe("Footer", () => {
  it("names the project and links to the repository pages", async () => {
    render(<Footer />);

    await expect
      .element(page.getByText("AI Toolkit by Noppu Labs"))
      .toBeVisible();
    await expect
      .element(
        page.getByText(
          "Deep code review and grounded investigation for coding agents.",
        ),
      )
      .toBeVisible();
    const links = page
      .getByRole("contentinfo")
      .getByRole("link")
      .elements()
      .map((link) => [link.textContent, link.getAttribute("href")]);
    expect(links).toEqual([
      ["GitHub", "https://github.com/noppu-labs/ai-toolkit"],
      ["License", "https://github.com/noppu-labs/ai-toolkit/blob/main/LICENSE"],
      [
        "Contributing",
        "https://github.com/noppu-labs/ai-toolkit/blob/main/CONTRIBUTING.md",
      ],
      ["Releases", "https://github.com/noppu-labs/ai-toolkit/releases"],
    ]);
  });

  it("sets the maker in a lighter weight than the project name", async () => {
    render(<Footer />);

    const maker = page.getByText("by Noppu Labs", { exact: true });
    await expect.element(maker).toBeVisible();
    const name = maker.element().parentElement;
    expect(name).not.toBeNull();
    const weight = (element: Element): number =>
      Number(getComputedStyle(element).fontWeight);
    expect(weight(maker.element())).toBeLessThan(weight(name as Element));
  });

  it("shows the GitHub mark, hidden from screen readers, in the GitHub link", async () => {
    render(<Footer />);

    const link = page.getByRole("link", { name: "GitHub" });
    await expect.element(link).toBeVisible();
    expect(link.element().querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
