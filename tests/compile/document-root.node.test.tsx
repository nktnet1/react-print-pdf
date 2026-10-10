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

test("moves root-wrapping Tailwind scope boundaries inside the body", () => {
  const id = "react-print-tailwind-test-0";
  const style = `<style>@scope (:where(template[data-react-print-tailwind-start="${id}"] ~ *)) { .font-bold { font-weight: 700 } }</style>`;
  const start = `<template data-react-print-tailwind-start="${id}"></template>`;
  const end = `<template data-react-print-tailwind-end="${id}"></template>`;
  const html = `<style>.print { color: red }</style>${style}${start}<html lang="en"><head><title>Report</title></head><body><main class="font-bold">Hello</main></body></html>${end}`;

  const actual = moveCompiledStylesIntoDocument(html);
  expect(actual).toBe(
    `<html lang="en"><head><style>.print { color: red }</style>${style}<title>Report</title></head><body>${start}<main class="font-bold">Hello</main>${end}</body></html>`,
  );
  expect(toHtmlDocument(actual)).toBe(actual);
});

test("keeps nested root-wrapping Tailwind scope pairs in the correct order", () => {
  const outer = "react-print-tailwind-outer-0";
  const inner = "react-print-tailwind-inner-1";
  const start = (id: string) =>
    `<template data-react-print-tailwind-start="${id}"></template>`;
  const end = (id: string) =>
    `<template data-react-print-tailwind-end="${id}"></template>`;
  const html = `<style>p{color:black}</style>${start(outer)}<style>p{font-weight:bold}</style>${start(inner)}<html><body><p>Nested</p></body></html>${end(inner)}${end(outer)}`;
  expect(moveCompiledStylesIntoDocument(html)).toBe(
    `<html><head><style>p{color:black}</style><style>p{font-weight:bold}</style></head><body>${start(outer)}${start(inner)}<p>Nested</p>${end(inner)}${end(outer)}</body></html>`,
  );
});

test("does not relocate incomplete or mismatched Tailwind scope pairs", () => {
  const start = '<template data-react-print-tailwind-start="one"></template>';
  const end = '<template data-react-print-tailwind-end="two"></template>';
  const malformed = `<style>p{color:red}</style>${start}<html><body>Content</body></html>${end}`;
  expect(moveCompiledStylesIntoDocument(malformed)).toBe(malformed);
  const noBody = `<style>p{color:red}</style>${start}<html><head></head></html><template data-react-print-tailwind-end="one"></template>`;
  expect(() => moveCompiledStylesIntoDocument(noBody)).toThrow(/body/i);
});

test("leaves dangling Tailwind scope markers untouched", () => {
  const start =
    '<template data-react-print-tailwind-start="dangling"></template>';
  const html = `<style>p{color:red}</style>${start}<html><body>Content</body></html>`;
  expect(moveCompiledStylesIntoDocument(html)).toBe(html);
});

test("requires a closing body tag for a Tailwind-wrapped complete document", () => {
  const id = "react-print-tailwind-unclosed";
  const start = `<template data-react-print-tailwind-start="${id}"></template>`;
  const end = `<template data-react-print-tailwind-end="${id}"></template>`;
  const html = `<style>p{color:blue}</style>${start}<html><head></head><body><main>Content</main></html>${end}`;
  expect(() => moveCompiledStylesIntoDocument(html)).toThrow(/body/);
});
