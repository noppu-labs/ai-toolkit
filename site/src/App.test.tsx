import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import App from "./App.tsx";
import { prefersReducedMotionQuery } from "./lib/scroll.ts";
import { writePluginParam } from "./lib/url-state.ts";
import { stubMediaQuery } from "./test/media.ts";

function onScreen(element: Element): boolean {
  const { right, left } = element.getBoundingClientRect();
  return right > 0 && left < window.innerWidth;
}

afterEach(() => {
  vi.restoreAllMocks();
  writePluginParam(null, { hash: "" });
  window.scrollTo({ top: 0, behavior: "instant" });
});

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

  it.each([
    [false, "smooth"],
    [true, "instant"],
  ])(
    "scrolls to the URL's section once rendered (reduced motion: %s)",
    async (reduce, behavior) => {
      stubMediaQuery(prefersReducedMotionQuery, reduce);
      const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
      window.history.replaceState(null, "", "#security");

      render(<App />);

      await expect.poll(() => scrollIntoView.mock.calls.length).toBe(1);
      expect(scrollIntoView.mock.contexts[0]).toBe(
        document.getElementById("security"),
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior, block: "start" });
    },
  );

  it("lands a section's heading just below the sticky header", async () => {
    await page.viewport(390, 844);
    stubMediaQuery(prefersReducedMotionQuery, true);
    window.history.replaceState(null, "", "#plugins");

    render(<App />);

    const header = page.getByRole("banner");
    const heading = page.getByRole("heading", {
      name: "Review anywhere. Go deep on your stack.",
    });
    await expect
      .poll(() =>
        Math.round(
          document.getElementById("plugins")?.getBoundingClientRect().top ?? -1,
        ),
      )
      .toBe(64);
    expect(heading.element().getBoundingClientRect().top).toBeGreaterThan(
      header.element().getBoundingClientRect().bottom,
    );
  });

  it("opens the catalog on a plugin from a card's skills link", async () => {
    stubMediaQuery(prefersReducedMotionQuery, true);
    render(<App />);

    await page.getByRole("link", { name: /^See \d+ laravel skills$/ }).click();

    const catalog = page.getByRole("region", { name: "The whole catalog." });
    await expect.element(catalog).toHaveFocus();
    await expect
      .element(
        catalog
          .getByRole("group", { name: "Filter by plugin" })
          .getByRole("button", { name: /^laravel \d+$/ }),
      )
      .toHaveAttribute("aria-pressed", "true");
    expect(window.location.search).toContain("plugin=laravel");
  });

  it("clears a typed catalog filter when a card's skills link is followed", async () => {
    stubMediaQuery(prefersReducedMotionQuery, true);
    render(<App />);
    const search = page.getByRole("searchbox", { name: "Filter skills" });

    await search.fill("zzz-no-such-skill");
    // A DOM click: Playwright's would scroll the link under the sticky header.
    const link = page.getByRole("link", { name: /^See \d+ laravel skills$/ });
    link
      .element()
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );

    await expect.element(search).toHaveValue("");
    await expect
      .element(page.getByText("No skills match your filter."))
      .not.toBeInTheDocument();
  });

  it("has no horizontal scroll on a phone", async () => {
    await page.viewport(360, 740);
    render(<App />);

    await expect.element(page.getByRole("main")).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });
});
