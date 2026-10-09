import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { createTailwindStyleCollector, Tailwind } from "#/tailwind/tailwind";

test.each([
  {
    name: "start",
    remainingMarker: "end",
  },
  {
    name: "end",
    remainingMarker: "start",
  },
])(
  "rejects Tailwind regions missing their $name marker",
  async ({ remainingMarker }) => {
    const collector = createTailwindStyleCollector();
    const id = collector.register({ preflight: false });
    const markup = `<template data-react-print-tailwind-${remainingMarker}="${id}"></template>`;

    await expect(collector.resolve(markup)).rejects.toThrow(
      `Unable to locate Tailwind render markers for ${id}.`,
    );
  },
);

test("independent collectors allocate different render boundaries", () => {
  const first = createTailwindStyleCollector().register({ preflight: false });
  const second = createTailwindStyleCollector().register({ preflight: false });
  expect(first).not.toBe(second);
});

test("a collector without Tailwind registrations leaves HTML untouched", async () => {
  const collector = createTailwindStyleCollector();
  const original = '<article class="font-bold"><p>Existing HTML</p></article>';

  expect(await collector.resolve(original)).toBe(original);
});

test("reusing a collector does not reuse candidates from previous HTML", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false });
  const wrap = (className: string) =>
    `<template data-react-print-tailwind-start="${id}"></template><span class="${className}">Content</span><template data-react-print-tailwind-end="${id}"></template>`;

  const first = await collector.resolve(wrap("text-[#123456]"));
  const second = await collector.resolve(wrap("text-[#654321]"));

  expect(first).toContain("#123456");
  expect(first).not.toContain("#654321");
  expect(second).toContain("#654321");
  expect(second).not.toContain("#123456");
  for (const markup of [first, second]) {
    expect(markup).toContain(`data-react-print-tailwind-start="${id}"`);
    expect(markup).toContain(`data-react-print-tailwind-end="${id}"`);
    expect(markup).not.toContain(`<style data-react-print-tailwind-`);
  }
});

test("collects actual class attributes without matching data-class attributes", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false });
  const html = `<template data-react-print-tailwind-start="${id}"></template><main data-class="bg-red-600" aria-class="p-7" class="text-blue-600">Content</main><template data-react-print-tailwind-end="${id}"></template>`;

  const result = await collector.resolve(html);

  expect(result).toContain(".text-blue-600");
  expect(result).not.toContain(".bg-red-600");
  expect(result).not.toContain(".p-7");
});

test("standalone Tailwind does not nest server rendering inside its hooks", () => {
  const html = renderToString(
    <Tailwind>
      <p className="text-lg">Standalone Tailwind example</p>
    </Tailwind>,
  );

  expect(html).toContain("Standalone Tailwind example");
  expect(html).toContain('class="text-lg"');
});

test("renaming Tailwind keyframes leaves CSS strings and URLs untouched", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({
    preflight: false,
    stylesheet: `@theme { --animate-wiggle: wiggle 1s linear; }
      @keyframes wiggle { to { opacity: .3 } }
      .custom-animation {
        animation-name: wiggle;
        --literal-name: "wiggle";
        --image-path: url(wiggle);
        content: "wiggle";
      }`,
  });
  const start = `<template data-react-print-tailwind-start="${id}"></template>`;
  const end = `<template data-react-print-tailwind-end="${id}"></template>`;
  const result = await collector.resolve(
    `${start}<div class="custom-animation animate-wiggle">Test</div>${end}`,
  );

  expect(result).toMatch(/@keyframes react-print-[\w-]+-wiggle/);
  expect(result).not.toMatch(/animation-name:\s*wiggle\b/);
  expect(result).toMatch(/--literal-name:\s*"wiggle"/);
  expect(result).toMatch(/--image-path:\s*url\(wiggle\)/);
  expect(result).toMatch(/content:\s*"wiggle"/);
});

test("renames unquoted font-family fallbacks without changing unrelated custom properties", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({
    preflight: false,
    stylesheet: `@font-face { font-family: First Font; src: url(first.woff2); }
      @font-face { font-family: Second Font; src: url(second.woff2); }
      @theme { --font-local: First Font, Second Font, serif; }
      .custom-font { font-family: First Font, Second Font, serif; --label: "First Font"; }`,
  });
  const start = `<template data-react-print-tailwind-start="${id}"></template>`;
  const end = `<template data-react-print-tailwind-end="${id}"></template>`;
  const result = await collector.resolve(
    `${start}<p class="font-local custom-font">Test</p>${end}`,
  );

  expect(result).not.toContain("font-family: First Font");
  expect(result).not.toContain("font-family: Second Font");
  expect(result).toMatch(
    /font-family:\s*"react-print-[^"]+-font-0"\s*,\s*"react-print-[^"]+-font-1"\s*,\s*serif/,
  );
  expect(result).toContain('--label: "First Font"');
});

test("collects classes from single-quoted and unquoted raw HTML attributes", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false });
  const html = [
    `<template data-react-print-tailwind-start="${id}"></template>`,
    `<section class='text-[#123abc]' data-class="bg-red-800">`,
    `<span class=bg-blue-600 class='font-bold'>Raw HTML</span>`,
    `</section>`,
    `<template data-react-print-tailwind-end="${id}"></template>`,
  ].join("");

  const result = await collector.resolve(html);
  const css = result.split("</style>")[0];
  expect(css).toContain("#123abc");
  expect(css).toContain(".bg-blue-600");
  expect(css).toContain(".font-bold");
  expect(css).not.toContain(".bg-red-800");
});

test("ignores class-like text in HTML comments and raw-text elements", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false });
  const html = [
    `<template data-react-print-tailwind-start="${id}"></template>`,
    `<!-- <div class="bg-[#010203]"></div> -->`,
    `<style>/* <div class="bg-[#040506]"></div> */</style>`,
    `<script type="application/json">{"markup":"<div class="bg-[#070809]"></div>"}</script>`,
    `<div class="bg-[#aabbcc]">Real content</div>`,
    `<template data-react-print-tailwind-end="${id}"></template>`,
  ].join("");

  const result = await collector.resolve(html);
  const css = result.split("</style>")[0];
  expect(css).toContain("#aabbcc");
  expect(css).not.toContain("#010203");
  expect(css).not.toContain("#040506");
  expect(css).not.toContain("#070809");
});

test("isolates unquoted multiword font names in CSS font shorthand", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({
    preflight: false,
    stylesheet: `@font-face { font-family: Example Family; src: url(font.woff2); }
      .font-shorthand { font: italic 16px/1.2 Example Family, serif; }`,
  });
  const html = `<template data-react-print-tailwind-start="${id}"></template><p class="font-shorthand">Hi</p><template data-react-print-tailwind-end="${id}"></template>`;
  const result = await collector.resolve(html);
  const css = result.split("</style>")[0];
  expect(css).toMatch(/font-family:\s*"react-print-[^"]+-font-0"/);
  expect(css).toMatch(
    /font:\s*italic 16px\/1\.2 "react-print-[^"]+-font-0", serif/,
  );
});

test("does not rewrite unrelated CSS variable values that match keyframes", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({
    preflight: false,
    stylesheet: `@keyframes wiggle { to { opacity: .4 } }
      .example {
        animation-name: wiggle;
        --status: wiggle;
        --animate-wiggle: wiggle 1s ease;
        --motion: var(--motion-actual);
        --motion-actual: wiggle 2s ease;
        animation: var(--motion);
      }`,
  });
  const html = `<template data-react-print-tailwind-start="${id}"></template><p class="example animate-wiggle">Hello</p><template data-react-print-tailwind-end="${id}"></template>`;
  const result = await collector.resolve(html);
  expect(result).toMatch(/--status:\s*wiggle\s*;/);
  expect(result).toMatch(/animation-name:\s*react-print-[\w-]+-wiggle/);
  expect(result).toMatch(/--animate-wiggle:\s*react-print-[\w-]+-wiggle/);
  expect(result).toMatch(/--motion:\s*var\(--motion-actual\)/);
  expect(result).toMatch(/--motion-actual:\s*react-print-[\w-]+-wiggle/);
});
