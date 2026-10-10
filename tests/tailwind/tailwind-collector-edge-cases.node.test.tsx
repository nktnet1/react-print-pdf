import { expect, test } from "vitest";
import { createTailwindStyleCollector } from "#/tailwind/tailwind";

const renderWithCollector = async (
  markup: string,
  stylesheet?: string,
): Promise<string> => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false, stylesheet });
  return collector.resolve(
    `<template data-react-print-tailwind-start="${id}"></template>${markup}<template data-react-print-tailwind-end="${id}"></template>`,
  );
};

const generatedCss = (html: string): string => {
  const end = html.indexOf("</style>");
  if (end < 0) throw new Error("Expected compiled Tailwind CSS");
  return html.slice(0, end);
};

test("ignores markup-like class attributes in doctypes and processing instructions", async () => {
  const html = await renderWithCollector(
    `<!DOCTYPE html class="bg-[#a00101]"><?xml class="bg-[#b00202]"?><p class="bg-[#c00303]">Live</p>`,
  );
  const css = generatedCss(html);
  expect(css).toContain("#c00303");
  expect(css).not.toContain("#a00101");
  expect(css).not.toContain("#b00202");
});

test("collects self-closing elements and continues after a stray attribute separator", async () => {
  const html = await renderWithCollector(
    `<input class="bg-[#a00404]"/><div / class='text-[#b00505]'>Continue</div>`,
  );
  const css = generatedCss(html);
  expect(css).toContain("#a00404");
  expect(css).toContain("#b00505");
});

test("handles an unterminated quoted attribute without inventing CSS classes", async () => {
  const html = await renderWithCollector(
    `<p class="bg-[#a00606]">Earlier</p><span class="bg-[#b00707]`,
  );
  const css = generatedCss(html);
  expect(css).toContain("#a00606");
  expect(css).not.toContain("#b00707");
});

test("leaves incomplete font shorthand line-height alone while scoping valid families", async () => {
  const html = await renderWithCollector(
    `<p class="example">Text</p>`,
    `@font-face { font-family: ExampleFamily; src: url(example.woff2); }
     .example { font: 16px/; font-family: ExampleFamily; }`,
  );
  const css = generatedCss(html);
  expect(css).toMatch(/font:\s*16px\/\s*;/);
  expect(css).toMatch(/font-family:\s*"react-print-[^"]+-font-0"/);
});

test("does not attempt to rename a malformed multi-token keyframes identifier", async () => {
  const html = await renderWithCollector(
    `<div class="sample">Animated</div>`,
    `@keyframes invalid name { to { opacity: .3; } }
     @keyframes valid { to { opacity: 1; } }
     .sample { animation-name: valid; }`,
  );
  const css = generatedCss(html);
  expect(css).toMatch(/@keyframes invalid name/);
  expect(css).toMatch(/@keyframes react-print-[\w-]+-valid/);
});

test("follows font-family variables referenced by font shorthand, without rewriting URL contents", async () => {
  const html = await renderWithCollector(
    `<p class="example">Text</p>`,
    `@font-face { font-family: ExampleFamily; src: url(example.woff2); }
     .example {
       --font-actual: var(--font-alias);
       --font-alias: ExampleFamily;
       --unrelated: ExampleFamily;
       font: italic 16px var(--font-actual), serif;
       font-family: url(ExampleFamily), var(--font-actual);
     }`,
  );
  const css = generatedCss(html);
  expect(css).toMatch(/--font-alias:\s*react-print-[\w-]+-font-0/);
  expect(css).toMatch(/--unrelated:\s*ExampleFamily/);
  expect(css).toMatch(/font:\s*italic 16px var\(--font-actual\)/);
  expect(css).toMatch(/url\(ExampleFamily\)/);
});
