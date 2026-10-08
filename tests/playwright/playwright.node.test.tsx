import { execFileSync } from "node:child_process";
import { type Browser, chromium } from "playwright";
import { Margins, PageBreak } from "react-print-pdf";
import {
  compileWithPlaywright,
  convertHtmlWithPlaywright,
} from "react-print-pdf/playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Inspect actual Chromium PDFs rather than searching compressed PDF streams for
// plaintext or assuming that HTML compilation guarantees a usable PDF.
// CI installs poppler-utils; local PDF integration tests need pdfinfo/pdftotext.
const pdfInfo = (pdf: Uint8Array): string =>
  execFileSync("pdfinfo", ["-"], {
    input: Buffer.from(pdf),
    encoding: "utf8",
    timeout: 15_000,
  });

const pdfText = (pdf: Uint8Array): string =>
  execFileSync("pdftotext", ["-layout", "-", "-"], {
    input: Buffer.from(pdf),
    encoding: "utf8",
    timeout: 15_000,
  });

const expectPdf = (pdf: Uint8Array) => {
  const contents = Buffer.from(pdf);
  expect(contents.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(contents.subarray(-256).toString("ascii")).toContain("%%EOF");
  return { info: pdfInfo(pdf), text: pdfText(pdf) };
};

describe("Playwright PDF integration", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  }, 30_000);

  test("compiles React into a readable, correctly paginated PDF", async () => {
    const pdf = await compileWithPlaywright(
      <>
        <Margins pageRatio="A5" top="32" right="24" bottom="32" left="24" />
        <h1>First invoice page</h1>
        <p>Invoice reference PRINT-123</p>
        <PageBreak />
        <h2>Second invoice page</h2>
        <p>Balance due 42 dollars</p>
      </>,
      { browser },
    );

    const { info, text } = expectPdf(pdf);
    expect(info).toMatch(/^Pages:\s*2$/m);
    expect(info).toMatch(/^Page size:.*\bA5\b/im);
    expect(text).toContain("First invoice page");
    expect(text).toContain("Invoice reference PRINT-123");
    expect(text).toContain("Second invoice page");
    expect(text).toContain("Balance due 42 dollars");
    expect(browser.contexts()).toHaveLength(0);
  }, 30_000);

  test("wraps HTML fragments and runs the readiness hook before printing", async () => {
    const pdf = await convertHtmlWithPlaywright(
      `<style>
        @media print { .screen-only { display: none; } }
        @media screen { .screen-only { display: block; } }
      </style>
      <main><p>HTML fragment</p><p class="screen-only">Screen media content</p></main>`,
      {
        browser,
        media: "screen",
        onPageReady: async (page) => {
          const status = await page.evaluate(() => ({
            doctype: document.doctype?.name,
            fonts: document.fonts.status,
            screen: matchMedia("screen").matches,
          }));
          expect(status).toEqual({
            doctype: "html",
            fonts: "loaded",
            screen: true,
          });

          await page.evaluate(() => {
            const paragraph = document.createElement("p");
            paragraph.textContent = "Inserted by readiness hook";
            document.body.append(paragraph);
          });
        },
      },
    );

    const { info, text } = expectPdf(pdf);
    expect(info).toMatch(/^Pages:\s*1$/m);
    expect(text).toContain("HTML fragment");
    expect(text).toContain("Screen media content");
    expect(text).toContain("Inserted by readiness hook");
    expect(browser.contexts()).toHaveLength(0);
  }, 30_000);

  test("preserves complete HTML documents and forwards PDF options", async () => {
    const pdf = await convertHtmlWithPlaywright(
      "<!doctype html><html><head><title>Existing document</title></head><body><main>Complete HTML document</main></body></html>",
      {
        browser,
        pdf: { format: "Letter", landscape: true },
        onPageReady: async (page) => {
          expect(await page.title()).toBe("Existing document");
        },
      },
    );

    const { info, text } = expectPdf(pdf);
    expect(info).toMatch(/^Pages:\s*1$/m);
    expect(info).toMatch(/^Page size:.*\bletter\b/im);
    expect(info).toMatch(/^Page size:\s*792(?:\.\d+)? x 612(?:\.\d+)? pts/im);
    expect(text).toContain("Complete HTML document");
  }, 30_000);

  test("closes the document context on errors but leaves a supplied browser open", async () => {
    const existingContexts = browser.contexts().length;

    await expect(
      convertHtmlWithPlaywright("<p>Will fail</p>", {
        browser,
        onPageReady: () => {
          throw new Error("readiness failed");
        },
      }),
    ).rejects.toThrow("readiness failed");

    expect(browser.isConnected()).toBe(true);
    expect(browser.contexts()).toHaveLength(existingContexts);
  }, 30_000);

  test("can launch and own its Chromium browser", async () => {
    const pdf = await convertHtmlWithPlaywright(
      "<main>Self-managed browser</main>",
    );
    expect(expectPdf(pdf).text).toContain("Self-managed browser");
  }, 30_000);
});
