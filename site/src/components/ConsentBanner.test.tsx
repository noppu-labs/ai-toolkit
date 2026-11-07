import { afterEach, describe, expect, it } from "vitest";
import { type Locator, page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { CONSENT_COOKIE, getConsentChoice } from "@/lib/analytics";
import { useConsentStore } from "@/stores/useConsentStore";
import { ConsentBanner } from "./ConsentBanner.tsx";

let opener: HTMLButtonElement | undefined;

function banner(): Locator {
  return page.getByRole("region", {
    name: /count (this visit|visits)|cookie settings/i,
  });
}

function getLook(element: Element): string[] {
  const style = getComputedStyle(element);

  return [
    style.backgroundColor,
    style.color,
    style.borderColor,
    style.borderWidth,
    style.boxShadow,
    style.fontWeight,
    style.height,
  ];
}

function pressEscape(): Promise<void> {
  return userEvent.keyboard("{Escape}");
}

function clickClose(): Promise<void> {
  return banner().getByRole("button", { name: "Close" }).click();
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
    await render(<ConsentBanner />);

    expect(useConsentStore.getState().panel).toBe("closed");
    expect(banner().query()).toBeNull();
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
    expect(getLook(allow)).toEqual(getLook(decline));
  });

  it("says the answer also applies on noppu.com", async () => {
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect
      .element(banner())
      .toMatchTextContent("Your answer applies on noppu.com too.");
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

  it("tells a visitor outside the opt-in regions that analytics runs, with equal Got it and Opt out buttons", async () => {
    useConsentStore.setState({ mode: "opt-out" });
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect
      .element(banner())
      .toMatchTextContent(/It runs unless you opt out\./);
    const gotIt = banner().getByRole("button", { name: "Got it" }).element();
    const optOut = banner().getByRole("button", { name: "Opt out" }).element();
    expect(getLook(gotIt)).toEqual(getLook(optOut));
  });

  it.each([
    ["Got it", "granted"],
    ["Opt out", "denied"],
  ])("records %s on the notice as %s and closes", async (name, choice) => {
    useConsentStore.setState({ mode: "opt-out" });
    useConsentStore.getState().openPrompt();
    render(<ConsentBanner />);

    await banner().getByRole("button", { name }).click();

    expect(getConsentChoice(document.cookie)).toBe(choice);
    await expect.element(banner()).not.toBeInTheDocument();
  });

  it.each([
    ["opt-out", "Analytics is on for you."],
    ["opt-in", "You haven't chosen yet."],
  ] as const)(
    "says in %s settings, before any answer, %s",
    async (mode, expected) => {
      useConsentStore.setState({ mode });
      useConsentStore.getState().openSettings();

      render(<ConsentBanner />);

      await expect.element(banner().getByText(expected)).toBeVisible();
    },
  );

  it("does not take focus when it prompts on its own", async () => {
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect.element(banner()).toBeVisible();
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    ["Escape", pressEscape],
    ["the Close button", clickClose],
  ])(
    "takes focus from settings, says the current choice and hands focus back when closed with %s",
    async (_, close) => {
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
      await close();
      await expect.element(banner()).not.toBeInTheDocument();
      expect(document.activeElement).toBe(opener);
      expect(getConsentChoice(document.cookie)).toBe("granted");
    },
  );

  it("ignores Escape while the prompt still needs an answer", async () => {
    useConsentStore.getState().openPrompt();
    render(<ConsentBanner />);
    await expect.element(banner()).toBeVisible();

    await pressEscape();

    await expect.element(banner()).toBeVisible();
  });

  it("offers no Close button while the prompt still needs an answer", async () => {
    useConsentStore.getState().openPrompt();

    render(<ConsentBanner />);

    await expect.element(banner()).toBeVisible();
    await expect
      .element(banner().getByRole("button", { name: "Close" }))
      .not.toBeInTheDocument();
  });
});
