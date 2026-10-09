import { execFileSync } from "node:child_process";
import { type Browser, chromium } from "playwright";
import { CSS, Latex, Margins, NoBreak, PageBreak } from "react-print-pdf";
import {
  compileWithPlaywright,
  convertHtmlWithPlaywright,
} from "react-print-pdf/playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// Inspect actual Chromium PDFs rather than searching compressed PDF streams for
// plaintext or assuming that HTML compilation guarantees a usable PDF.
// CI installs poppler-utils; local PDF integration requires pdfinfo, pdftotext,
// pdfimages, pdffonts and pdftoppm.
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

const pdfPageText = (pdf: Uint8Array, page: number): string =>
  execFileSync(
    "pdftotext",
    ["-f", String(page), "-l", String(page), "-", "-"],
    {
      input: Buffer.from(pdf),
      encoding: "utf8",
      timeout: 15_000,
    },
  );

const pdfImages = (pdf: Uint8Array): string =>
  execFileSync("pdfimages", ["-list", "-"], {
    input: Buffer.from(pdf),
    encoding: "utf8",
    timeout: 15_000,
  });

const pdfFonts = (pdf: Uint8Array): string =>
  execFileSync("pdffonts", ["-"], {
    input: Buffer.from(pdf),
    encoding: "utf8",
    timeout: 15_000,
  });

// Sample the centre of the first rendered page. This tests actual printed
// pixels, not just the presence of a background-color rule in the HTML.
const pdfCenterPixel = (pdf: Uint8Array): number[] => {
  const ppm = execFileSync(
    "pdftoppm",
    ["-f", "1", "-l", "1", "-singlefile", "-scale-to", "40", "-"],
    { input: Buffer.from(pdf), timeout: 15_000 },
  );
  const header = /^P6\n(\d+) (\d+)\n255\n/.exec(ppm.toString("ascii", 0, 64));
  if (!header) throw new Error("Unexpected PPM header from pdftoppm");

  const width = Number(header[1]);
  const height = Number(header[2]);
  const pixelOffset =
    header[0].length +
    (Math.floor(height / 2) * width + Math.floor(width / 2)) * 3;
  return [...ppm.subarray(pixelOffset, pixelOffset + 3)];
};

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

  test("prints LaTeX with embedded KaTeX fonts and no external stylesheet", async () => {
    const pdf = await compileWithPlaywright(
      <main>
        <Latex>{String.raw`\frac{1}{2} + \sqrt{x}`}</Latex>
      </main>,
      {
        browser,
        onPageReady: async (page) => {
          const styles = await page.evaluate(async () => {
            await document.fonts.ready;
            return {
              localStyles: document.querySelectorAll(
                'style[data-href="react-print-pdf-katex"]',
              ).length,
              fontLoaded: document.fonts.check('16px "KaTeX_Main"'),
              remoteStyles: document.querySelectorAll(
                'link[rel="stylesheet"][href^="http"]',
              ).length,
            };
          });
          expect(styles).toEqual({
            localStyles: 1,
            fontLoaded: true,
            remoteStyles: 0,
          });
        },
      },
    );

    expect(pdfFonts(pdf)).toContain("KaTeX_Main-Regular");
    expect(pdfFonts(pdf)).toContain("KaTeX_Math-Italic");
    expect(browser.contexts()).toHaveLength(0);
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

  test("uses print media for readiness measurements before generating the PDF", async () => {
    const pdf = await convertHtmlWithPlaywright(
      `<style>
        @page { size: 360px 240px; margin: 20px; }
        .panel { width: 60px; }
        @media print { .panel { width: 180px; } }
      </style>
      <div class="panel"></div>
      <p id="measurement"></p>`,
      {
        browser,
        onPageReady: async (page) => {
          const measurement = await page.evaluate(() => {
            const panel = document.querySelector(".panel");
            const output = document.querySelector("#measurement");
            if (!panel || !output) throw new Error("Missing test elements");

            const width = getComputedStyle(panel).width;
            output.textContent = `Measured: ${width}`;
            return { print: matchMedia("print").matches, width };
          });

          expect(measurement).toEqual({ print: true, width: "180px" });
        },
      },
    );

    expect(pdfInfo(pdf)).toMatch(/^Pages:\s*1$/m);
    expect(pdfText(pdf)).toContain("Measured: 180px");
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

  test("keeps a NoBreak group together when it reaches a page boundary", async () => {
    const pdf = await compileWithPlaywright(
      <>
        <CSS>{`@page { size: 360px 420px; margin: 0; }
          html, body { margin: 0; font: 16px/20px Arial, sans-serif; }`}</CSS>
        <div style={{ height: 337 }}>Before protected group</div>
        <NoBreak>
          <div style={{ height: 72 }}>Protected first line</div>
          <div style={{ height: 72 }}>Protected second line</div>
        </NoBreak>
      </>,
      { browser },
    );

    expect(pdfInfo(pdf)).toMatch(/^Pages:\s*2$/m);
    expect(pdfPageText(pdf, 1)).toContain("Before protected group");
    expect(pdfPageText(pdf, 1)).not.toContain("Protected first line");
    expect(pdfPageText(pdf, 2)).toContain("Protected first line");
    expect(pdfPageText(pdf, 2)).toContain("Protected second line");
  }, 30_000);

  test("paginates three sections naturally without explicit page breaks", async () => {
    const pdf = await compileWithPlaywright(
      <>
        <CSS>{`@page { size: 360px 420px; margin: 0; }
          html, body { margin: 0; font: 16px/20px Arial, sans-serif; }
          section { height: 400px; break-inside: avoid; }`}</CSS>
        <section>Natural page one</section>
        <section>Natural page two</section>
        <section>Natural page three</section>
      </>,
      { browser },
    );

    expect(pdfInfo(pdf)).toMatch(/^Pages:\s*3$/m);
    const markers = [
      "Natural page one",
      "Natural page two",
      "Natural page three",
    ];
    for (const [index, marker] of markers.entries()) {
      const text = pdfPageText(pdf, index + 1);
      expect(text).toContain(marker);
      for (const other of markers) {
        if (other !== marker) expect(text).not.toContain(other);
      }
    }
  }, 30_000);

  test("prints solid backgrounds by default and respects printBackground false", async () => {
    const document = (
      <>
        <CSS>{`@page { size: 240px 240px; margin: 0; }
          html, body { margin: 0; }`}</CSS>
        <div
          style={{
            width: 220,
            height: 220,
            backgroundColor: "#2364b8",
          }}
        />
      </>
    );

    const withBackground = await compileWithPlaywright(document, { browser });
    const withoutBackground = await compileWithPlaywright(document, {
      browser,
      pdf: { printBackground: false },
    });

    expect(pdfInfo(withBackground)).toMatch(/^Pages:\s*1$/m);
    expect(pdfInfo(withoutBackground)).toMatch(/^Pages:\s*1$/m);
    const [red, green, blue] = pdfCenterPixel(withBackground);
    expect(red).toBeLessThan(70);
    expect(green).toBeGreaterThan(60);
    expect(green).toBeLessThan(150);
    expect(blue).toBeGreaterThan(140);
    expect(pdfCenterPixel(withoutBackground)).toEqual([255, 255, 255]);
  }, 30_000);

  test("embeds an inline PNG as an image in the PDF", async () => {
    // A small, real 24x24 bitmap, with no network or external file dependency.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAOklEQVR42mO8I+nIgAqc4mejiexbmEpQDRMDlcCoQYQBo1zFHTLiCFPNaGDTM9ZG89poXhsNbLoYBABXZhd92PeziAAAAABJRU5ErkJggg==";
    const pdf = await compileWithPlaywright(
      <img
        src={`data:image/png;base64,${png}`}
        alt="Embedded bitmap"
        width={96}
        height={96}
      />,
      { browser },
    );

    expect(pdfInfo(pdf)).toMatch(/^Pages:\s*1$/m);
    expect(pdfImages(pdf)).toMatch(/^\s*1\s+\d+\s+image\s+24\s+24\s+/m);
  }, 30_000);

  test("loads a custom font-face and embeds its font in the PDF", async () => {
    // Use installed browser fonts, not an external font server. The local()
    // fallback list covers both Linux CI and macOS developer machines.
    const pdf = await compileWithPlaywright(
      <>
        <CSS>{`@font-face {
          font-family: "Print Regression Face";
          src: local("Arial"), local("DejaVu Sans"),
            local("Liberation Sans"), local("Helvetica");
        }
        .font-test { font: 24px "Print Regression Face", sans-serif; }`}</CSS>
        <p className="font-test">Custom font PDF content</p>
      </>,
      {
        browser,
        onPageReady: async (page) => {
          const fonts = await page.evaluate(async () => {
            const loaded = await document.fonts.load(
              '24px "Print Regression Face"',
            );
            return loaded.map((font) => ({
              family: font.family,
              status: font.status,
            }));
          });
          expect(fonts).toEqual([
            { family: "Print Regression Face", status: "loaded" },
          ]);
        },
      },
    );

    expect(pdfText(pdf)).toContain("Custom font PDF content");
    expect(pdfFonts(pdf)).toMatch(
      /^(?=.*(?:Arial|DejaVu|Liberation|Helvetica)).*\byes\s+yes\s+(?:yes|no)\s+\d+\s+\d+\s*$/m,
    );
  }, 30_000);
});
