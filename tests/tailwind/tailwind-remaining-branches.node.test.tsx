import { describe, expect, test } from "vitest";
import { createTailwindStyleCollector } from "#/tailwind/tailwind";

const resolveRegion = async (markup: string, stylesheet?: string) => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false, stylesheet });
  return collector.resolve(
    `<template data-react-print-tailwind-start="${id}"></template>${markup}<template data-react-print-tailwind-end="${id}"></template>`,
  );
};

const getCss = (html: string) => {
  const end = html.indexOf("</style>");
  expect(end).toBeGreaterThan(0);
  return html.slice(0, end);
};

describe("Tailwind HTML class collection", () => {
  test("preserves a region containing text without any HTML tags", async () => {
    const html = await resolveRegion("Plain text content, no elements");
    expect(html).toContain("Plain text content, no elements");
    expect(getCss(html)).toContain("@scope");
  });

  test("parses whitespace after an attribute equals sign", async () => {
    const html = await resolveRegion(
      `<span class  =   'text-[#ab1245]'>Styled text</span>`,
    );
    expect(getCss(html)).toContain("#ab1245");
  });

  test.each([
    {
      name: "unterminated comment",
      tail: '<!-- <div class="bg-[#ee0011]">',
    },
    {
      name: "unterminated processing instruction",
      tail: '<?xml class="bg-[#ee0011]"',
    },
    {
      name: "unterminated declaration",
      tail: '<!SOMETHING class="bg-[#ee0011]"',
    },
    { name: "unfinished tag name", tail: "<span" },
    { name: "an invalid start-tag character", tail: "<>" },
    { name: "an attribute without an equals sign", tail: "<input disabled>" },
    { name: "an unfinished attribute name", tail: "<input disabled" },
    { name: "a truncated unquoted attribute", tail: "<input data-value= " },
    { name: "a truncated tag after whitespace", tail: "<input " },
    {
      name: "a raw-text element without a close tag",
      tail: '<style><div class="bg-[#ee0011]">',
    },
    {
      name: "a plaintext element",
      tail: '<plaintext><div class="bg-[#ee0011]">',
    },
  ])("ignores non-elements following $name", async ({ tail }) => {
    const html = await resolveRegion(
      `<div class="bg-[#009977]">Real content</div>${tail}`,
    );
    const css = getCss(html);
    expect(css).toContain("#009977");
    expect(css).not.toContain("#ee0011");
    expect(html).toContain(tail);
  });
});

describe("Tailwind CSS identifiers and aliases", () => {
  test("keeps line-height spacing while scoping a font family", async () => {
    const css = getCss(
      await resolveRegion(
        `<span class="example">Text</span>`,
        `@font-face { font-family: Example Family; src: url(local.woff2); }
         .example { font: 16px /   1.4 Example Family; }`,
      ),
    );
    expect(css).toMatch(
      /font:\s*16px\s*\/\s*1\.4\s+"react-print-[^"]+-font-0"/,
    );
  });

  test("preserves malformed font descriptors, unknown animations, and unresolved family aliases", async () => {
    const css = getCss(
      await resolveRegion(
        '<div class="example">Text</div>',
        `@font-face { font-family: Local Font; src: url(local.woff2); }
         @font-face { font-family: Local Font; src: url(local-alternative.woff2); }
         @font-face { font-family: var(--dynamic-family); src: url(dynamic.woff2); }
         @font-face { font-family:; src: url(empty.woff2); }
         @keyframes known { to { opacity: .7; } }
         .example {
           font: inherit;
           font: 16px;
           font: italic 16px Unregistered Font, serif;
           font-family: Unregistered Font, var(--external);
           --self-reference: var(--self-reference);
           font-family: var(--self-reference);
           animation-name: "unknown-animation";
           animation-name: known;
         }`,
      ),
    );
    const scopedFontNames = [
      ...css.matchAll(/@font-face\s*\{\s*font-family:\s*"([^"]+)"/g),
    ];
    expect(scopedFontNames).toHaveLength(2);
    expect(scopedFontNames[0][1]).toBe(scopedFontNames[1][1]);
    expect(css).toMatch(/font-family:\s*var\(--dynamic-family\)/);
    expect(css).toMatch(/font-family:\s*;/);
    expect(css).toContain("font: inherit");
    expect(css).toContain("font: 16px");
    expect(css).toContain("Unregistered Font");
    expect(css).toContain("var(--external)");
    expect(css).toContain("var(--self-reference)");
    expect(css).toContain('animation-name: "unknown-animation"');
    expect(css).toMatch(/animation-name:\s*react-print-[\w-]+-known/);
  });
});
