import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { REDUCED_MOTION_QUERY } from "@/lib/scroll";
import { Footer } from "./Footer.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("sets the links in a 2×2 grid on phones", async () => {
    await page.viewport(390, 844);
    render(<Footer />);

    const links = page.getByRole("contentinfo").getByRole("link");
    await expect.element(links.first()).toBeVisible();
    const boxes = links.elements().map((link) => link.getBoundingClientRect());
    const columns = new Set(boxes.map((box) => Math.round(box.left)));
    const rows = new Set(boxes.map((box) => Math.round(box.top)));
    expect(columns.size).toBe(2);
    expect(rows.size).toBe(2);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  it("goes back to the top and moves focus to the main content", async () => {
    await page.viewport(390, 844);
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    render(
      <>
        {/* biome-ignore lint/correctness/useUniqueElementIds: stands in for the skip link's target. */}
        <main id="main" tabIndex={-1} />
        <Footer />
      </>,
    );

    await page.getByRole("button", { name: "Back to top" }).click();

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      behavior: "smooth",
    });
    await expect.element(page.getByRole("main")).toHaveFocus();
  });

  it("jumps without animating when the visitor prefers less motion", async () => {
    await page.viewport(390, 844);
    const original = window.matchMedia.bind(window);
    vi.spyOn(window, "matchMedia").mockImplementation((query: string) =>
      query === REDUCED_MOTION_QUERY
        ? ({ matches: true, media: query } as MediaQueryList)
        : original(query),
    );
    const scrollTo = vi
      .spyOn(window, "scrollTo")
      .mockImplementation(() => undefined);
    render(<Footer />);

    await page.getByRole("button", { name: "Back to top" }).click();

    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
      top: 0,
      behavior: "instant",
    });
  });

  it("leaves “Back to top” to phones", async () => {
    await page.viewport(1280, 800);
    render(<Footer />);

    await expect
      .element(page.getByRole("link", { name: "GitHub" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Back to top" }))
      .not.toBeInTheDocument();
  });
});
