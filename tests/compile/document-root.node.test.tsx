import { expect, test } from "vitest";
import { compile } from "#/compile/compile";
import {
  moveCompiledStylesIntoDocument,
  toHtmlDocument,
} from "#/html/html-document";

test("moves React 18's leading print styles inside an existing document head", () => {
  const compiled =
    '<style>.print { color: red }</style><html lang="en"><head><title>Report</title></head><body>Ready</body></html>';
  const result = moveCompiledStylesIntoDocument(compiled);
  expect(result).toBe(
    '<html lang="en"><head><style>.print { color: red }</style><title>Report</title></head><body>Ready</body></html>',
  );
  expect(toHtmlDocument(result)).toBe(result);
});

test("creates a head for a complete document that omits one", () => {
  const compiled =
    "<style>.print { color: red }</style><html><body>Report</body></html>";
  expect(moveCompiledStylesIntoDocument(compiled)).toBe(
    "<html><head><style>.print { color: red }</style></head><body>Report</body></html>",
  );
});

test("keeps multiple leading styles in document order, including their attributes", () => {
  const compiled =
    '<style data-test="one">a { color: red }</style>\n' +
    '<style data-test="two">b { color: blue }</style><html><head></head><body>Ok</body></html>';
  expect(moveCompiledStylesIntoDocument(compiled)).toBe(
    '<html><head><style data-test="one">a { color: red }</style>\n' +
      '<style data-test="two">b { color: blue }</style></head><body>Ok</body></html>',
  );
});

test("preserves HTML fragments and React 19 documents without leading print styles", () => {
  const cases = [
    "<style>a { color: red }</style><main>Fragment</main>",
    "<html><head><style>a { color: blue }</style></head><body>Report</body></html>",
    "<!-- Comment --><html><head></head><body>Report</body></html>",
  ];
  for (const html of cases) {
    expect(moveCompiledStylesIntoDocument(html)).toBe(html);
  }
});

test("compile preserves an explicit html root", async () => {
  const result = await compile(
    <html lang="en">
      <head>
        <title>Report</title>
      </head>
      <body>
        <h1>Summary</h1>
      </body>
    </html>,
  );
  expect(result.startsWith('<html lang="en">')).toBe(true);
  expect(result).toContain("<h1>Summary</h1>");
});

test("Emotion compilation also keeps a complete document root", async () => {
  const result = await compile(
    <html lang="en">
      <head>
        <title>Emotion report</title>
      </head>
      <body>
        <main>Ready to print</main>
      </body>
    </html>,
    { emotion: true },
  );
  expect(result.startsWith('<html lang="en">')).toBe(true);
  expect(result).toContain("<main>Ready to print</main>");
});

test("ordinary HTML fragments still get a complete document wrapper", () => {
  const fragment = "<p>Standalone fragment</p>";
  expect(toHtmlDocument(fragment)).toBe(
    '<!doctype html><html><head><meta charset="utf-8"></head><body><p>Standalone fragment</p></body></html>',
  );
});
