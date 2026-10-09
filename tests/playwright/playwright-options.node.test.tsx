import { jsx } from "@emotion/react";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  compileWithPlaywright,
  convertHtmlWithPlaywright,
} from "react-print-pdf/playwright";
import { expect, test, vi } from "vitest";

const createBrowser = () => {
  const events: string[] = [];
  const setContent = vi.fn(async (_html: string) => {
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
      "media",
      "setContent",
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
  expect(fixture.emulateMedia).toHaveBeenCalledExactlyOnceWith({
    media: "print",
  });
  expect(fixture.events).toEqual([
    "media",
    "setContent",
    "pdf",
    "close context",
  ]);
});

test.each([
  "<!-- generated report -->\n<!doctype html><html><body>PDF</body></html>",
  "<!-- first --><!-- second -->\n<html><body>PDF</body></html>",
])("preserves complete documents after leading HTML comments", async (html) => {
  const fixture = createBrowser();
  await convertHtmlWithPlaywright(html, {
    browser: fixture.browser,
    waitForFonts: false,
  });

  expect(fixture.setContent).toHaveBeenCalledWith(html, {
    waitUntil: "load",
  });
  expect(fixture.closeContext).toHaveBeenCalledOnce();
});

test("forwards browser options and awaits the readiness hook before printing", async () => {
  const fixture = createBrowser();
  const document =
    '  <HTML lang="en"><body>Preserve complete HTML</body></HTML>';

  await convertHtmlWithPlaywright(document, {
    browser: fixture.browser,
    context: { viewport: { width: 640, height: 480 } },
    setContent: { waitUntil: "networkidle" },
    media: null,
    pdf: { preferCSSPageSize: false, printBackground: false, outline: false },
    waitForFonts: false,
    onPageReady: async () => {
      await Promise.resolve();
      fixture.events.push("ready");
    },
  });

  expect(fixture.browser.newContext).toHaveBeenCalledWith({
    viewport: { width: 640, height: 480 },
  });
  expect(fixture.setContent).toHaveBeenCalledWith(document, {
    waitUntil: "networkidle",
  });
  expect(fixture.emulateMedia).toHaveBeenCalledWith({ media: null });
  expect(fixture.pdf).toHaveBeenCalledWith({
    preferCSSPageSize: false,
    printBackground: false,
    outline: false,
    tagged: true,
  });
  expect(fixture.evaluate).not.toHaveBeenCalled();
  expect(fixture.events).toEqual([
    "media",
    "setContent",
    "ready",
    "pdf",
    "close context",
  ]);
});

test.each(["setContent", "pdf"] as const)(
  "closes the isolated context when %s fails",
  async (operation) => {
    const fixture = createBrowser();
    const failure = new Error(`${operation} failed`);
    fixture[operation].mockRejectedValueOnce(failure);

    await expect(
      convertHtmlWithPlaywright("<p>Failed document</p>", {
        browser: fixture.browser,
        waitForFonts: false,
      }),
    ).rejects.toBe(failure);

    expect(fixture.closeContext).toHaveBeenCalledOnce();
    expect(fixture.closeBrowser).not.toHaveBeenCalled();
    if (operation === "setContent") {
      expect(fixture.pdf).not.toHaveBeenCalled();
    }
  },
);

test("passes Emotion compile options through to Playwright", async () => {
  const fixture = createBrowser();

  const pdf = await compileWithPlaywright(
    jsx("p", { css: { color: "#123456" } }, "Styled document"),
    {
      browser: fixture.browser,
      compile: { emotion: true },
      waitForFonts: false,
    },
  );

  const html = fixture.setContent.mock.calls[0]?.[0];
  expect(html).toContain("Styled document");
  expect(html).toContain("#123456");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
  expect(Buffer.from(pdf).toString()).toBe("%PDF-1.7");
  expect(fixture.closeContext).toHaveBeenCalledOnce();
});
