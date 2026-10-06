import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { InstallSection } from "./InstallSection.tsx";

const CLAUDE_CODE_COMMANDS = [
  "/plugin marketplace add noppu-labs/ai-toolkit",
  "/plugin install review@ai-toolkit",
  "/plugin install investigate@ai-toolkit",
  "/plugin install laravel@ai-toolkit",
  "/plugin install inertia-react@ai-toolkit",
  "/laravel:install-rules",
  "/inertia-react:install-rules",
].join("\n");

const SKILLS_CLI_COMMANDS = [
  "npx skills add noppu-labs/ai-toolkit/review",
  "npx skills add noppu-labs/ai-toolkit/investigate",
  "npx skills add noppu-labs/ai-toolkit/laravel",
  "npx skills add noppu-labs/ai-toolkit/inertia-react",
].join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallSection", () => {
  it("is the #install region, labelled by its heading", async () => {
    render(<InstallSection />);

    await expect
      .element(page.getByRole("region", { name: "Two ways in." }))
      .toHaveAttribute("id", "install");
  });

  it("shows the Claude Code commands first", async () => {
    render(<InstallSection />);

    await expect
      .element(page.getByRole("tab", { name: "Claude Code marketplace" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByText("/plugin marketplace add noppu-labs/ai-toolkit", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText("install-rules commands", { exact: false }))
      .toBeVisible();
    await expect
      .element(page.getByText("npx skills add", { exact: false }))
      .not.toBeInTheDocument();
  });

  it("switches to the skills CLI commands and note", async () => {
    render(<InstallSection />);

    await page.getByRole("tab", { name: "Vercel skills CLI" }).click();

    await expect
      .element(page.getByRole("tab", { name: "Vercel skills CLI" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(
        page.getByText("npx skills add noppu-labs/ai-toolkit/investigate", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect
      .element(page.getByText("is not set on this route", { exact: false }))
      .toBeVisible();
    await expect
      .element(page.getByText("/plugin marketplace add", { exact: false }))
      .not.toBeInTheDocument();
  });

  it("copies the Claude Code commands to the clipboard", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<InstallSection />);

    await page
      .getByRole("button", { name: "Copy Claude Code install commands" })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(CLAUDE_CODE_COMMANDS);
  });

  it("copies the skills CLI commands to the clipboard", async () => {
    const writeText = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);
    render(<InstallSection />);

    await page.getByRole("tab", { name: "Vercel skills CLI" }).click();
    await page
      .getByRole("button", { name: "Copy skills CLI commands" })
      .click();

    expect(writeText).toHaveBeenCalledExactlyOnceWith(SKILLS_CLI_COMMANDS);
  });
});
