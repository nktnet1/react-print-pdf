import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "react-print-pdf";
import { expect, test } from "vitest";

// Regression for #51: a CMS description is often typed as ReactNode, even
// when its runtime value is a Markdown string.
const renderDescription = (description: ReactNode) =>
  renderToStaticMarkup(
    <Markdown options={{ forceBlock: true }}>{description}</Markdown>,
  );

test("accepts ReactNode-typed Markdown strings", () => {
  const html = renderDescription("# Report\n\nAn **important** result.");

  expect(html).toMatch(/<h1\b[^>]*>Report<\/h1>/);
  expect(html).toContain("<strong>important</strong>");
});

test("joins adjacent text and fragments before parsing Markdown", () => {
  const html = renderDescription(
    <>
      {"# Report\n\n"}
      {"An **important"}
      {" result**."}
      {0}
    </>,
  );

  expect(html).toMatch(/<h1\b[^>]*>Report<\/h1>/);
  expect(html).toContain("<strong>important result</strong>");
  expect(html).toContain("0");
});

test("preserves React elements alongside Markdown text", () => {
  const html = renderDescription([
    "**Before**",
    <span key="custom" data-custom="true">
      Custom
    </span>,
    "*After*",
  ]);

  expect(html).toContain("<strong>Before</strong>");
  expect(html).toContain('<span data-custom="true">Custom</span>');
  expect(html).toContain("<em>After</em>");
  expect(html).not.toContain("[object Object]");
  expect(renderDescription(null)).toBe("");
});

test("detects headings across ReactNode children for a table of contents", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ level, children }) => (
        <span data-toc-level={level}>{children}</span>
      )}
    >
      {["# First\n\n<Toc />\n\n", "## Second"]}
    </Markdown>,
  );

  expect(html).toContain('data-toc-level="1"');
  expect(html).toContain('data-toc-level="2"');
  expect(html).toContain("First");
  expect(html).toContain("Second");
});
