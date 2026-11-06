import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { InstallBox } from "./InstallBox.tsx";

const PLUGIN = "opencode-permission-reviewer";
const V2_COMMAND =
  "opencode plugin add @noppu-labs/opencode-permission-reviewer";
const V1_COMMAND =
  "bunx @noppu-labs/opencode-permission-reviewer init --host auto --npm --tui --yes";

const TWO_HOSTS: { label: string; commands: string[]; note?: string }[] = [
  { label: "OpenCode V2", commands: [V2_COMMAND] },
  {
    label: "OpenCode V1",
    commands: [V1_COMMAND],
    note: "On V1, `opencode plugin` misses the TUI overlay.",
  },
];

const ACCENT = "bg-plugin-opencode-permission-reviewer";

function mockClipboard(): ReturnType<typeof vi.fn> {
  return vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InstallBox", () => {
  it("shows a single host's command with no tabs", async () => {
    const { container } = await render(
      <InstallBox
        accentClass={ACCENT}
        hosts={[{ label: "OpenCode V2", commands: [V2_COMMAND] }]}
        plugin={PLUGIN}
      />,
    );

    expect(container.querySelector('[role="tablist"]')).toBeNull();
    await expect
      .element(page.getByText(V2_COMMAND, { exact: true }))
      .toBeVisible();
    await expect
      .element(
        page.getByRole("button", {
          name: `Copy the OpenCode V2 install command for ${PLUGIN}`,
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("gives two hosts a tab each, with the first selected", async () => {
    await render(
      <InstallBox accentClass={ACCENT} hosts={TWO_HOSTS} plugin={PLUGIN} />,
    );

    await expect.element(page.getByRole("tablist")).toBeVisible();
    await expect
      .element(page.getByRole("tab", { name: "OpenCode V2" }))
      .toHaveAttribute("aria-selected", "true");
    await expect
      .element(page.getByRole("tab", { name: "OpenCode V1" }))
      .toHaveAttribute("aria-selected", "false");
  });

  it("keeps the other host's command in the page, hidden until its tab is chosen", async () => {
    await render(
      <InstallBox accentClass={ACCENT} hosts={TWO_HOSTS} plugin={PLUGIN} />,
    );
    const v1Command = page.getByText(V1_COMMAND, { exact: true });
    const v2Command = page.getByText(V2_COMMAND, { exact: true });

    await expect.element(v1Command).toBeInTheDocument();
    await expect.element(v1Command).not.toBeVisible();
    await expect.element(v2Command).toBeVisible();

    await page.getByRole("tab", { name: "OpenCode V1" }).click();

    await expect.element(v1Command).toBeVisible();
    await expect.element(v2Command).not.toBeVisible();
    await expect.element(v2Command).toBeInTheDocument();
  });

  it("copies the command of the host on show", async () => {
    const writeText = mockClipboard();
    await render(
      <InstallBox accentClass={ACCENT} hosts={TWO_HOSTS} plugin={PLUGIN} />,
    );

    await page
      .getByRole("button", {
        name: `Copy the OpenCode V2 install command for ${PLUGIN}`,
        exact: true,
      })
      .click();
    expect(writeText).toHaveBeenLastCalledWith(V2_COMMAND);

    await page.getByRole("tab", { name: "OpenCode V1" }).click();
    await page
      .getByRole("button", {
        name: `Copy the OpenCode V1 install command for ${PLUGIN}`,
        exact: true,
      })
      .click();
    expect(writeText).toHaveBeenLastCalledWith(V1_COMMAND);
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("numbers the Copy buttons of a host with several commands", async () => {
    await render(
      <InstallBox
        accentClass={ACCENT}
        hosts={[{ label: "OpenCode V2", commands: ["first", "second"] }]}
        plugin={PLUGIN}
      />,
    );

    await expect
      .element(
        page.getByRole("button", {
          name: `Copy the OpenCode V2 install command for ${PLUGIN} (step 2)`,
          exact: true,
        }),
      )
      .toBeVisible();
  });

  it("renders the host's and the box's notes with inline code", async () => {
    const { container } = await render(
      <InstallBox
        accentClass={ACCENT}
        hosts={TWO_HOSTS}
        note="Restart OpenCode. Settings go in `permission-reviewer.jsonc`."
        plugin={PLUGIN}
      />,
    );

    const codes = [...container.querySelectorAll("p code")].map(
      (code) => code.textContent,
    );
    expect(codes).toEqual(["opencode plugin", "permission-reviewer.jsonc"]);
  });
});
