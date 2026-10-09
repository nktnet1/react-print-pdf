import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "react-print-pdf";
import { expect, test } from "vitest";
import { __docConfig } from "#/markdown/markdown";

const examples = __docConfig.components.Markdown.examples;

test("Markdown custom component documentation example renders replacements", () => {
  const template = examples?.customComponent?.template;
  if (!template) throw new Error("Missing custom component example");

  const html = renderToStaticMarkup(template);

  expect(html).toContain("Non-Disclosure Agreement");
  expect(html).toContain("John Doe");
  expect(html).toContain("20/month");
  expect(html).toContain("color:blue");
  expect(html).not.toContain("<CustomerName");
  expect(html).not.toContain("<AgreementTitle");
});

test("Markdown table-of-contents documentation example renders links and page breaks", async () => {
  const template = examples?.tableOfContents?.template;
  if (!template) throw new Error("Missing table-of-contents example");

  const html = await compile(template);

  expect(html).toContain('class="block py-2 border-b -toc-link"');
  expect(html).toMatch(/<a\b[^>]*href="#/);
  expect(html).toContain("This is a level 1 header");
  expect(html).toContain("This is a level 2 header");
  expect(html).toContain('class="react-print-page-break');
});
