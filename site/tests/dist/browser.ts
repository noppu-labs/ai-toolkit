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

/** How far past its limit an element's right edge may sit: rounding. */
const EDGE_TOLERANCE = 1;

/**
 * The elements under `#root` that stick out to the right, each as
 * `tag#id.classes (right edge N, past M: what ends at M)`, at most 10.
 *
 * An element must end within its nearest ancestor whose `overflow-x` is
 * `hidden` or `clip`, which would cut it off. Cards clip for their rounded
 * corners, so text running past a card's edge is caught even when the card
 * fits the screen. The page frame, the outermost such ancestor under `#root`,
 * clips whatever sticks out of the page, so `scrollWidth` never grows and text
 * cut off on a phone goes unnoticed. An element whose only clipping ancestor
 * is the frame, or that has none, must therefore end within the viewport.
 *
 * Two kinds of element are exempt: those inside an ancestor whose `overflow-x`
 * is `auto` or `scroll`, which the visitor scrolls sideways (the plugin chips
 * on a phone), and those inside an `aria-hidden="true"` subtree, such as the
 * decorative band, whose strip runs past the page on purpose. The scrolling
 * ancestor itself is still checked.
 *
 * Throws when the page has no `#root`.
 */
export function pastTheRightEdge(page: Page): Promise<string[]> {
  return page.evaluate((tolerance: number): string[] => {
    const root = document.querySelector("#root");
    if (root === null) {
      throw new Error(`${location.pathname} has no #root`);
    }
    interface Limit {
      right: number;
      name: string;
    }
    const label = (element: Element): string => {
      const id = element.id === "" ? "" : `#${element.id}`;
      const classes = (element.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((name) => name !== "")
        .join(".");
      return `${element.localName}${id}${classes === "" ? "" : `.${classes}`.slice(0, 80)}`;
    };
    const overflowX = (element: Element): string =>
      getComputedStyle(element).overflowX;
    const ancestors = (element: Element): Element[] => {
      const found: Element[] = [];
      for (
        let node = element.parentElement;
        node !== null && node !== root;
        node = node.parentElement
      ) {
        found.push(node);
      }
      return found;
    };
    const viewport: Limit = {
      right: document.documentElement.clientWidth,
      name: "the viewport",
    };
    // Where the element must end, or `null` when it sits in a sideways scroller.
    const limitOf = (element: Element): Limit | null => {
      const above = ancestors(element);
      if (above.some((node) => ["auto", "scroll"].includes(overflowX(node)))) {
        return null;
      }
      const clipping = above.filter((node) =>
        ["hidden", "clip"].includes(overflowX(node)),
      );
      // The outermost is the frame, which stands for the viewport.
      const nearest = clipping.length > 1 ? clipping[0] : undefined;
      return nearest === undefined
        ? viewport
        : {
            right: nearest.getBoundingClientRect().right,
            name: `the right edge of ${label(nearest)}`,
          };
    };
    return [...root.querySelectorAll("*")]
      .filter((element) => element.closest('[aria-hidden="true"]') === null)
      .flatMap((element): string[] => {
        const limit = limitOf(element);
        const { right } = element.getBoundingClientRect();
        return limit !== null && right > limit.right + tolerance
          ? [
              `${label(element)} (right edge ${Math.round(right)}, past ${Math.round(limit.right)}: ${limit.name})`,
            ]
          : [];
      })
      .slice(0, 10);
  }, EDGE_TOLERANCE);
}
