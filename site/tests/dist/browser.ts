import {
  type Browser,
  type BrowserContextOptions,
  chromium,
  type Page,
  type Response,
} from "playwright";
import { afterAll, inject } from "vitest";

export interface OpenPageOptions {
  javaScript?: boolean;
  width?: number;
  height?: number;
  colorScheme?: "light" | "dark";
  reducedMotion?: boolean;
  /** `localStorage` as the page's scripts first find it. */
  storage?: Readonly<Record<string, string>>;
  /** Every `localStorage` access throws, as when the visitor blocks site data. */
  storageBlocked?: boolean;
  /** Wait until every island has hydrated (only with JavaScript on). */
  waitForHydration?: boolean;
}

export interface OpenedPage {
  page: Page;
  response: Response | null;
  /** Console errors and warnings, and uncaught page errors, as they happen. */
  errors: string[];
  close(): Promise<void>;
}

/** How long islands get to hydrate after the `load` event. */
const HYDRATION_TIMEOUT = 5000;

let browser: Promise<Browser> | undefined;

// One browser per test file; each page gets a context of its own, so no
// storage or setting carries over from one test to the next.
afterAll(async () => {
  await (await browser)?.close();
});

function contextOptions(
  baseURL: string,
  {
    javaScript = true,
    width = 1440,
    height = 900,
    colorScheme = "light",
    reducedMotion = false,
    storage = {},
  }: OpenPageOptions,
): BrowserContextOptions {
  return {
    baseURL,
    javaScriptEnabled: javaScript,
    viewport: { width, height },
    colorScheme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: Object.entries(storage).map(([name, value]) => ({
            name,
            value,
          })),
        },
      ],
    },
  };
}

function blockStorage(): void {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get(): never {
      throw new DOMException("The operation is insecure.", "SecurityError");
    },
  });
}

/** Opens `path` of the built site in a fresh browser context. */
export async function openPage(
  path: string,
  options: OpenPageOptions = {},
): Promise<OpenedPage> {
  const { javaScript = true, waitForHydration = true } = options;
  browser ??= chromium.launch();
  const context = await (await browser).newContext(
    contextOptions(inject("baseUrl"), options),
  );
  try {
    if (options.storageBlocked === true) {
      await context.addInitScript(blockStorage);
    }
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        errors.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });
    const response = await page.goto(path);
    if (javaScript && waitForHydration) {
      await page.waitForFunction(
        () => document.querySelector("astro-island[ssr]") === null,
        undefined,
        { timeout: HYDRATION_TIMEOUT },
      );
    }
    return { page, response, errors, close: () => context.close() };
  } catch (error) {
    await context.close();
    throw error;
  }
}
