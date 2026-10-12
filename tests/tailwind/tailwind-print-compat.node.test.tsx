import { describe, expect, test } from "vitest";
import { createTailwindStyleCollector } from "#/tailwind/tailwind";

const compileUtilities = async (
  options: { preflight?: boolean; legacyPrintStyles?: boolean } = {},
) => {
  const collector = createTailwindStyleCollector();
  const id = collector.register(options);
  const markup = [
    `<template data-react-print-tailwind-start="${id}"></template>`,
    '<p class="brightness-70 print:brightness-70 brightness-75 brightness-[.7] border border-red-500">Speaker name</p>',
    `<template data-react-print-tailwind-end="${id}"></template>`,
  ].join("");
  return (await collector.resolve(markup)).split("</style>")[0];
};

describe("legacy print styling", () => {
  test("preserves the v3 border default and supported brightness utilities", async () => {
    const css = await compileUtilities();
    expect(css).toMatch(/border-color:\s*#e5e7eb/);
    expect(css).toContain(".brightness-75");
    expect(css).toContain(".brightness-\\[\\.7\\]");
    expect(css).not.toContain(".brightness-70");
    expect(css).not.toContain(".print\\:brightness-70");
    expect(css).toContain(".border-red-500");
  });

  test("keeps v4 defaults and additional filters when requested", async () => {
    const css = await compileUtilities({ legacyPrintStyles: false });
    expect(css).toContain(".brightness-70");
    expect(css).toContain(".print\\:brightness-70");
    expect(css).not.toContain("border-color: #e5e7eb");
  });

  test("respects disabled preflight rather than injecting global border styles", async () => {
    const css = await compileUtilities({ preflight: false });
    expect(css).not.toContain("border-color: #e5e7eb");
  });
});
