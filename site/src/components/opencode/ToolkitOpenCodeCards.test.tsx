import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import type { ToolkitOpenCodeCard } from "@/lib/opencode-cards";
import { ToolkitOpenCodeCards } from "./ToolkitOpenCodeCards.tsx";

const REVIEW: ToolkitOpenCodeCard = {
  name: "review",
  description: "Code review skills for any language",
  skillCount: 6,
  packageName: "@noppu-labs/opencode-review",
  command: "opencode plugin add @noppu-labs/opencode-review",
  skillsHref: "/?plugin=review#skills",
  accentClass: "bg-plugin-review",
};
const INVESTIGATE: ToolkitOpenCodeCard = {
  ...REVIEW,
  name: "investigate",
  description: "Structural briefs",
  skillCount: 1,
  packageName: "@noppu-labs/opencode-investigate",
  command: "opencode plugin add @noppu-labs/opencode-investigate",
  skillsHref: "/?plugin=investigate#skills",
  accentClass: "bg-plugin-investigate",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ToolkitOpenCodeCards", () => {
  it("shows the name, the OpenCode V2 badge, the description and the chips", async () => {
    await render(<ToolkitOpenCodeCards cards={[REVIEW, INVESTIGATE]} />);

    expect(page.getByRole("article").elements()).toHaveLength(2);
    await expect
      .element(page.getByRole("heading", { name: "review", exact: true }))
      .toBeVisible();
    expect(page.getByText("OpenCode V2").elements()).toHaveLength(2);
    await expect
      .element(page.getByText("Code review skills for any language"))
      .toBeVisible();
    await expect.element(page.getByText("6 skills")).toBeVisible();
    await expect
      .element(page.getByText("1 skill", { exact: true }))
      .toBeVisible();
    expect(
      page.getByText("any language", { exact: true }).elements(),
    ).toHaveLength(2);
  });

  it("shows the install command and copies it", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    await render(<ToolkitOpenCodeCards cards={[REVIEW]} />);

    await expect
      .element(page.getByText(REVIEW.command, { exact: true }))
      .toBeVisible();
    await page
      .getByRole("button", {
        name: "Copy the install command for the review OpenCode package",
      })
      .click();

    expect(writeText).toHaveBeenCalledWith(REVIEW.command);
  });

  it("links to the plugin's skills, counting them", async () => {
    await render(<ToolkitOpenCodeCards cards={[REVIEW, INVESTIGATE]} />);

    await expect
      .element(page.getByRole("link", { name: "See 6 review skills" }))
      .toHaveAttribute("href", "/?plugin=review#skills");
    await expect
      .element(page.getByRole("link", { name: "See 1 investigate skill" }))
      .toHaveAttribute("href", "/?plugin=investigate#skills");
  });
});
