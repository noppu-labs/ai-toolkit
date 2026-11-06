import { readFileSync } from "node:fs";
import type { Cookie, Page } from "playwright";
import { afterEach, describe, expect, inject, it } from "vitest";
import { type OpenedPage, openPage, settle } from "./browser.ts";

const PRODUCTION = "https://toolkit.noppu.com";
const MEASUREMENT_ID = "G-MHP3L2JTTP";

interface GoogleTraffic {
  urls: string[];
}

let opened: OpenedPage | undefined;

afterEach(async () => {
  // Hydration may still be fetching through the routes when a test ends.
  await opened?.page.unrouteAll({ behavior: "ignoreErrors" });
  await opened?.close();
  opened = undefined;
});

/** Serves the built site at production's address and stands in for Google, so nothing leaves the machine. */
async function routeProduction(page: Page): Promise<GoogleTraffic> {
  const traffic: GoogleTraffic = { urls: [] };
  await page.route(`${PRODUCTION}/**`, async (route) => {
    const { pathname, search } = new URL(route.request().url());
    const response = await route.fetch({
      url: `${inject("baseUrl")}${pathname}${search}`,
    });
    await route.fulfill({ response });
  });
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => {
    traffic.urls.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: "" });
  });

  return traffic;
}

async function openProduction(
  path = "/",
): Promise<OpenedPage & { traffic: GoogleTraffic }> {
  let traffic: GoogleTraffic = { urls: [] };
  opened = await openPage(`${PRODUCTION}${path}`, {
    beforeLoad: async (page: Page): Promise<void> => {
      traffic = await routeProduction(page);
    },
  });
  await settle(opened.page);

  return { ...opened, traffic };
}

/** The commands the page queued for Google's tag, as arrays. */
function getQueuedCommands(page: Page): Promise<unknown[][]> {
  return page.evaluate(() =>
    (
      (window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ??
      []
    ).map((entry) => Array.from(entry)),
  );
}

async function getCookie(
  page: Page,
  name: string,
): Promise<Cookie | undefined> {
  const cookies = await page.context().cookies(PRODUCTION);

  return cookies.find((cookie) => cookie.name === name);
}

describe("analytics on the production host", () => {
  it("sends nothing to Google and asks first", async () => {
    const { page, traffic } = await openProduction();

    await page.getByRole("button", { name: "Allow analytics" }).waitFor();

    expect(traffic.urls).toEqual([]);
    expect(await getQueuedCommands(page)).toEqual([]);
  });

  it("starts the tag once the visitor allows it, with consent set before anything is measured", async () => {
    const { page, traffic } = await openProduction();

    await page.getByRole("button", { name: "Allow analytics" }).click();

    await expect
      .poll(() => traffic.urls)
      .toEqual([
        `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`,
      ]);
    const commands = await getQueuedCommands(page);
    expect(commands.map((command) => command[0])).toEqual([
      "consent",
      "consent",
      "js",
      "config",
    ]);
    expect(commands[0]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
      },
    ]);
    expect(commands[1]).toEqual([
      "consent",
      "update",
      { analytics_storage: "granted" },
    ]);
    expect(commands[3]).toEqual(["config", MEASUREMENT_ID]);
    expect(await getCookie(page, "noppu_analytics_consent")).toMatchObject({
      value: "granted",
      domain: ".noppu.com",
      secure: true,
    });
  });

  it("starts the tag on the next page without asking again", async () => {
    const { page, traffic } = await openProduction();
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect.poll(() => traffic.urls.length).toBe(1);

    await page.goto(`${PRODUCTION}/opencode`);
    await settle(page);

    await expect.poll(() => traffic.urls.length).toBe(2);
    expect(
      await page.getByRole("button", { name: "Allow analytics" }).count(),
    ).toBe(0);
  });

  it("sends nothing after a decline, on this page or the next", async () => {
    const { page, traffic } = await openProduction();

    await page.getByRole("button", { name: "No thanks" }).click();
    await page.goto(`${PRODUCTION}/opencode`);
    await settle(page);

    expect(traffic.urls).toEqual([]);
    expect(await page.getByRole("button", { name: "No thanks" }).count()).toBe(
      0,
    );
    expect((await getCookie(page, "noppu_analytics_consent"))?.value).toBe(
      "denied",
    );
  });

  it("turns measurement off and clears Google's cookies when the visitor changes their mind", async () => {
    const { page, traffic } = await openProduction();
    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect.poll(() => traffic.urls.length).toBe(1);
    // Google's real tag would have written these; the stand-in does not.
    await page.context().addCookies(
      ["_ga", `_ga_${MEASUREMENT_ID.slice(2)}`].map((name) => ({
        name,
        value: "GA1",
        domain: ".noppu.com",
        path: "/",
      })),
    );

    await page.getByRole("button", { name: "Cookie settings" }).click();
    await page.getByRole("button", { name: "No thanks" }).click();

    expect(
      await page.evaluate(
        (id) =>
          (window as unknown as Record<string, unknown>)[`ga-disable-${id}`],
        MEASUREMENT_ID,
      ),
    ).toBe(true);
    expect((await getQueuedCommands(page)).at(-1)).toEqual([
      "consent",
      "update",
      { analytics_storage: "denied" },
    ]);
    expect(await getCookie(page, "_ga")).toBeUndefined();
    expect(
      await getCookie(page, `_ga_${MEASUREMENT_ID.slice(2)}`),
    ).toBeUndefined();

    await page.goto(`${PRODUCTION}/opencode`);
    await settle(page);

    expect(traffic.urls.length).toBe(1);
  });

  it("logs no errors while asking and starting", async () => {
    const { page, errors, traffic } = await openProduction();

    await page.getByRole("button", { name: "Allow analytics" }).click();
    await expect.poll(() => traffic.urls.length).toBe(1);

    expect(errors).toEqual([]);
  });
});

describe("analytics anywhere else", () => {
  it("neither asks nor starts Google's tag, but still lets a reviewer open the banner", async () => {
    opened = await openPage("/");
    await settle(opened.page);
    const { page } = opened;
    const allow = page.getByRole("button", { name: "Allow analytics" });

    expect(await allow.count()).toBe(0);

    await page.getByRole("button", { name: "Cookie settings" }).click();
    await allow.click();

    // The click starts the tag synchronously, if it starts it at all.
    expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(
      0,
    );
    expect(await getQueuedCommands(page)).toEqual([]);
    expect(await page.evaluate(() => document.cookie)).toBe(
      "noppu_analytics_consent=granted",
    );
  });
});

describe("the built HTML", () => {
  it("names no Google script, so a visitor without JavaScript never loads it", () => {
    const html = readFileSync(
      new URL("../../dist/index.html", import.meta.url),
      "utf8",
    );

    expect(html).not.toMatch(/googletagmanager|google-analytics/);
  });
});

describe("the privacy page", () => {
  it("discloses Google Analytics, links Google's own explanation and offers the choice again", async () => {
    opened = await openPage("/privacy");

    await opened.page
      .getByRole("heading", { level: 1, name: "Privacy" })
      .waitFor();
    const main = opened.page.getByRole("main");
    expect(await main.textContent()).toContain("Google Analytics");
    expect(
      await main
        .getByRole("link", {
          name: "How Google uses information from sites or apps that use our services",
        })
        .getAttribute("href"),
    ).toBe("https://policies.google.com/technologies/partner-sites");
    await main.getByRole("button", { name: "Cookie settings" }).click();
    await opened.page
      .getByRole("button", { name: "Allow analytics" })
      .waitFor();
  });
});
