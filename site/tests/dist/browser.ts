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
  /** Runs on the new page before it loads `path`, for example to route its requests. */
  beforeLoad?: (page: Page) => Promise<void>;
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
    await options.beforeLoad?.(page);
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

/** How far past the viewport's width an element's right edge may sit: rounding. */
const EDGE_TOLERANCE = 1;

/**
 * The elements under `#root` whose right edge lies past the viewport, each as
 * `tag#id.classes (right edge N)`, at most 10.
 *
 * The page frame (the outermost element under `#root` whose `overflow-x` is
 * `auto`, `scroll`, `hidden` or `clip`) clips whatever sticks out sideways, so
 * `scrollWidth` never grows and text cut off on a phone goes unnoticed. That
 * clip is a safety net this check must see through, so it exempts nothing.
 * A component's own clip is a decision about its content: an element inside
 * such an ancestor (below the frame) may extend past the viewport, as a
 * scrolling code block or a full-bleed strip does. The ancestor itself is
 * still checked, so a clipping container that is too wide is caught.
 */
export function pastTheRightEdge(page: Page): Promise<string[]> {
  return page.evaluate((tolerance: number): string[] => {
    const limit = document.documentElement.clientWidth + tolerance;
    const root = document.querySelector("#root");
    const clipsSideways = (element: Element): boolean =>
      ["auto", "scroll", "hidden", "clip"].includes(
        getComputedStyle(element).overflowX,
      );
    // Every clipping ancestor under `#root` but the outermost, which is the frame.
    const clippedByComponent = (element: Element): boolean => {
      const clipping: Element[] = [];
      for (
        let node = element.parentElement;
        node !== null && node !== root;
        node = node.parentElement
      ) {
        if (clipsSideways(node)) {
          clipping.push(node);
        }
      }
      return clipping.length > 1;
    };
    const describe = (element: Element, right: number): string => {
      const id = element.id === "" ? "" : `#${element.id}`;
      const classes = (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((name) => name !== "")
        .join(".");
      const label = classes === "" ? "" : `.${classes}`.slice(0, 80);
      return `${element.localName}${id}${label} (right edge ${Math.round(right)})`;
    };
    return [...document.querySelectorAll("#root *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > limit &&
          !clippedByComponent(element),
      )
      .slice(0, 10)
      .map((element) =>
        describe(element, element.getBoundingClientRect().right),
      );
  }, EDGE_TOLERANCE);
}
