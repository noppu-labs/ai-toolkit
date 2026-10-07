import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CommandLine } from "./CommandText.tsx";

describe("CommandLine", () => {
  it("reads as the plain command, with the prompt hidden from screen readers", async () => {
    const { container } = await render(
      <CommandLine command="npx skills add noppu-labs/ai-toolkit/laravel" />,
    );

    const code = page.getByText(
      "npx skills add noppu-labs/ai-toolkit/laravel",
      {
        exact: true,
      },
    );
    await expect.element(code).toBeVisible();
    expect(code.element().tagName).toBe("CODE");
    expect(container.querySelector("[aria-hidden=true]")?.textContent).toBe(
      "›",
    );
  });

  it("breaks only between words, or after the repo slug in a plugin path", async () => {
    const { container } = await render(
      <CommandLine command="gh attestation verify --repo noppu-labs/ai-toolkit/inertia-react" />,
    );

    const words = [...container.querySelectorAll("code > span")].map(
      (span) => span.textContent,
    );
    expect(words).toEqual([
      "gh",
      "attestation",
      "verify",
      "--repo",
      "noppu-labs/ai-toolkit/",
      "inertia-react",
    ]);
    for (const span of container.querySelectorAll("code > span")) {
      expect(getComputedStyle(span).whiteSpace).toBe("nowrap");
    }
    expect(container.querySelectorAll("code > wbr")).toHaveLength(1);
  });

  it("indents wrapped lines past the prompt", async () => {
    await page.viewport(320, 600);
    const { container } = await render(
      <div style={{ width: "160px" }}>
        <CommandLine command="/plugin install inertia-react@ai-toolkit" />
      </div>,
    );

    const words = [...container.querySelectorAll("code > span")];
    const [first, , last] = words.map((word) => word.getBoundingClientRect());
    // Wrapped onto a later line, starting where the command did, not under the prompt.
    expect(last?.top).toBeGreaterThan(first?.top ?? 0);
    expect(Math.round(last?.left ?? 0)).toBe(Math.round(first?.left ?? 0));
  });
});
