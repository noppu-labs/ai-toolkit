import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { Footer } from "./Footer.tsx";

describe("Footer", () => {
  it("names the project and links to the repository pages", async () => {
    render(<Footer />);

    await expect
      .element(page.getByText("Noppu Labs — AI Toolkit"))
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
});
