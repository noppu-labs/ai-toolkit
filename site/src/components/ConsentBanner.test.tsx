import { afterEach, describe, expect, it } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CONSENT_COOKIE, getConsentChoice } from "@/lib/analytics";
import { useConsentStore } from "@/stores/useConsentStore";
import { ConsentBanner } from "./ConsentBanner.tsx";

let opener: HTMLButtonElement | undefined;

function banner(): Locator {
  return page.getByRole("region", {
    name: /count this visit|cookie settings/i,
  });
}

afterEach(() => {
  opener?.remove();
  opener = undefined;
  useConsentStore.setState(useConsentStore.getInitialState(), true);
  // biome-ignore lint/suspicious/noDocumentCookie: the cookie the banner writes, cleared between tests.
  document.cookie = `${CONSENT_COOKIE}=; Path=/; Max-Age=0`;
});

describe("ConsentBanner", () => {
  it("stays out of the way off the production host, where analytics never runs", async () => {
    render(<ConsentBanner />);

    await expect.element(banner()).not.toBeInTheDocument();
  });

  it("offers both choices as equal buttons and links the privacy page", async () => {
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect
      .element(banner().getByRole("link", { name: /privacy/i }))
      .toHaveAttribute("href", "/privacy");
    const allow = banner()
      .getByRole("button", { name: "Allow analytics" })
      .element();
    const decline = banner()
      .getByRole("button", { name: "No thanks" })
      .element();
    expect(allow.getBoundingClientRect().height).toBe(
      decline.getBoundingClientRect().height,
    );
  });

  it.each([
    ["an allow", "Allow analytics", "granted"],
    ["a decline", "No thanks", "denied"],
  ])("records %s and closes", async (_, name, choice) => {
    useConsentStore.getState().openPrompt();
    render(<ConsentBanner />);

    await banner().getByRole("button", { name }).click();

    expect(getConsentChoice(document.cookie)).toBe(choice);
    await expect.element(banner()).not.toBeInTheDocument();
  });

  it("does not take focus when it prompts on its own", async () => {
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect.element(banner()).toBeVisible();
    expect(document.activeElement).toBe(document.body);
  });

  it("takes focus from settings, says the current choice and hands focus back on close", async () => {
    // biome-ignore lint/suspicious/noDocumentCookie: a visitor who chose earlier.
      document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
      opener = document.body.appendChild(document.createElement("button"));
      opener.focus();
      useConsentStore.getState().openSettings();

      render(<ConsentBanner />);

      await expect.element(banner()).toHaveFocus();
      await expect
        .element(banner().getByText("Analytics is on for you."))
        .toBeVisible();
      await userEvent.keyboard("{Escape}");
      await expect.element(banner()).not.toBeInTheDocument();
      expect(document.activeElement).toBe(opener);
      expect(getConsentChoice(document.cookie)).toBe("granted");
    },
  );

  it("ignores Escape while the prompt still needs an answer", async () => {
    useConsentStore.getState().openPrompt();
    render(<ConsentBanner />);
    await expect.element(banner()).toBeVisible();

    await userEvent.keyboard("{Escape}");

    await expect.element(banner()).toBeVisible();
  });
});
