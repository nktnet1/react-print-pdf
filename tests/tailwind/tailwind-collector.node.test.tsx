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
