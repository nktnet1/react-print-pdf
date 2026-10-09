import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  chromium,
  type LaunchOptions,
  type Page,
} from "playwright";
import type React from "react";
import { type CompileOptions, compile } from "#/compile/compile";
import { toHtmlDocument } from "#/html/html-document";

export type PlaywrightSetContentOptions = NonNullable<
  Parameters<Page["setContent"]>[1]
>;

export type PlaywrightPdfOptions = Omit<
  NonNullable<Parameters<Page["pdf"]>[0]>,
  "path"
>;

export interface PlaywrightRenderOptions {
  /**
   * Reuse an existing Chromium browser. The integration creates and closes a
   * fresh browser context for each document but leaves this browser open.
   */
  browser?: Browser;
  /** Options used when React Print PDF launches Chromium itself. */
  launch?: LaunchOptions;
  /** Options used for the isolated browser context created for this document. */
  context?: BrowserContextOptions;
  /** Options forwarded to `page.setContent()`. Defaults `waitUntil` to `load`. */
  setContent?: PlaywrightSetContentOptions;
  /**
   * Options forwarded to `page.pdf()`.
   *
   * React Print PDF defaults CSS page sizing, printed backgrounds, document
   * outlines, and tagged PDF output to `true`.
   */
  pdf?: PlaywrightPdfOptions;
  /**
   * Media applied before loading HTML and running the readiness hook.
   * Defaults to `print` so styles, fonts, and layout measurements match the
   * generated PDF. Pass `screen` to print using screen CSS, or `null` to reset
   * media emulation to the browser default.
   */
  media?: "print" | "screen" | null;
  /** Wait for `document.fonts.ready` before rendering. Defaults to `true`. */
  waitForFonts?: boolean;
  /**
   * Optional hook for application-specific readiness, such as waiting for a
   * chart or remotely loaded asset before `page.pdf()` runs.
   */
  onPageReady?: (page: Page) => void | Promise<void>;
}

export interface PlaywrightCompileOptions extends PlaywrightRenderOptions {
  /** Options forwarded to React Print PDF's `compile()` function. */
  compile?: CompileOptions;
}

const DEFAULT_PDF_OPTIONS = {
  preferCSSPageSize: true,
  printBackground: true,
  outline: true,
  tagged: true,
} satisfies PlaywrightPdfOptions;

const waitForDocumentFonts = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
};

/**
 * Render already-compiled HTML as a PDF with Playwright Chromium.
 *
 * If `options.browser` is omitted, Chromium is launched for this call and
 * closed afterwards. When a browser is supplied, only the per-document browser
 * context is closed so the browser can be reused across requests.
 */
export const convertHtmlWithPlaywright = async (
  html: string,
  options: PlaywrightRenderOptions = {},
): Promise<Uint8Array> => {
  const ownsBrowser = options.browser === undefined;
  const browser = options.browser ?? (await chromium.launch(options.launch));
  let context: BrowserContext | undefined;

  try {
    context = await browser.newContext(options.context);
    const page = await context.newPage();

    // Page.setContent() normally starts in screen media, while page.pdf()
    // switches to print media. Apply the final media mode before loading the
    // document so print-only resources and onPageReady layout measurements
    // use the same styles that will be printed.
    await page.emulateMedia({
      media: options.media === undefined ? "print" : options.media,
    });

    await page.setContent(toHtmlDocument(html), {
      waitUntil: "load",
      ...options.setContent,
    });

    if (options.waitForFonts ?? true) {
      await waitForDocumentFonts(page);
    }

    await options.onPageReady?.(page);

    const pdf = await page.pdf({
      ...DEFAULT_PDF_OPTIONS,
      ...options.pdf,
    });

    return new Uint8Array(pdf);
  } finally {
    try {
      await context?.close();
    } finally {
      if (ownsBrowser) {
        await browser.close();
      }
    }
  }
};

/** Compile a React document and render it as a PDF with Playwright Chromium. */
export const compileWithPlaywright = async (
  node: React.ReactElement,
  options: PlaywrightCompileOptions = {},
): Promise<Uint8Array> => {
  const html = await compile(node, options.compile);
  return convertHtmlWithPlaywright(html, options);
};
