import type { Browser, BrowserContext, Page } from "playwright";
import { convertHtmlWithPlaywright } from "react-print-pdf/playwright";
import { expect, test, vi } from "vitest";

const createBrowser = () => {
  const events: string[] = [];
  const setContent = vi.fn(async () => {
    events.push("setContent");
  });
  const evaluate = vi.fn(async (callback: () => Promise<void>) => {
    await callback();
    events.push("fonts");
  });
  const pdf = vi.fn(async () => {
    events.push("pdf");
    return Buffer.from("%PDF-1.7");
  });
  const emulateMedia = vi.fn(async () => {
    events.push("media");
  });
  const closeContext = vi.fn(async () => {
    events.push("close context");
  });
  const closeBrowser = vi.fn();
  const page = { setContent, evaluate, pdf, emulateMedia } as unknown as Page;
  const context = {
    newPage: vi.fn(async () => page),
    close: closeContext,
  } as unknown as BrowserContext;
  const browser = {
    newContext: vi.fn(async () => context),
    close: closeBrowser,
  } as unknown as Browser;

  return {
    browser,
    events,
    setContent,
    evaluate,
    pdf,
    emulateMedia,
    closeContext,
    closeBrowser,
  };
};

test("waits for document fonts before rendering a PDF by default", async () => {
  const fixture = createBrowser();
  let fontReadCount = 0;
  // Exercise the callback passed to page.evaluate: a real browser executes it
  // outside Node coverage instrumentation.
  vi.stubGlobal("document", {
    fonts: {
      get ready() {
        fontReadCount++;
        return Promise.resolve();
      },
    },
  });

  try {
    const result = await convertHtmlWithPlaywright("<p>Rendered fragment</p>", {
      browser: fixture.browser,
      media: "screen",
      setContent: { waitUntil: "domcontentloaded" },
      pdf: { format: "A5" },
    });

    expect(Buffer.from(result).toString()).toBe("%PDF-1.7");
    expect(fixture.setContent).toHaveBeenCalledWith(
      expect.stringContaining("<!doctype html>"),
      { waitUntil: "domcontentloaded" },
    );
    expect(fixture.emulateMedia).toHaveBeenCalledWith({ media: "screen" });
    expect(fixture.evaluate).toHaveBeenCalledOnce();
    expect(fontReadCount).toBe(1);
    expect(fixture.events).toEqual([
      "setContent",
      "media",
      "fonts",
      "pdf",
      "close context",
    ]);
    expect(fixture.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        preferCSSPageSize: true,
        printBackground: true,
        outline: true,
        tagged: true,
        format: "A5",
      }),
    );
    expect(fixture.closeContext).toHaveBeenCalledOnce();
    expect(fixture.closeBrowser).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("can skip waiting for fonts and leaves complete HTML documents unchanged", async () => {
  const fixture = createBrowser();
  const document = "<html><body>Complete document</body></html>";

  const pdf = await convertHtmlWithPlaywright(document, {
    browser: fixture.browser,
    waitForFonts: false,
  });

  expect(pdf).toBeInstanceOf(Uint8Array);
  expect(fixture.setContent).toHaveBeenCalledWith(document, {
    waitUntil: "load",
  });
  expect(fixture.evaluate).not.toHaveBeenCalled();
  expect(fixture.emulateMedia).not.toHaveBeenCalled();
  expect(fixture.events).toEqual(["setContent", "pdf", "close context"]);
});
