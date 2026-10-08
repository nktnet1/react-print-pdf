import type { PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown, PageBreak } from "react-print-pdf";
import { expect, test } from "vitest";

const render = (source: string) =>
  renderToStaticMarkup(
    <Markdown options={{ forceBlock: true }}>{source}</Markdown>,
  );

test("renders document tables, lists and blockquotes", () => {
  const html = render(
    [
      "## Statement",
      "",
      "| Item | Units |",
      "| --- | ---: |",
      "| Paper | 3 |",
      "",
      "- **Approved**",
      "- Archived",
      "",
      "> Reviewed by finance.",
    ].join("\n"),
  );

  expect(html).toMatch(/<h2\b[^>]*>Statement<\/h2>/);
  expect(html).toMatch(/<table\b/);
  expect(html).toMatch(/<th\b[^>]*>\s*Item\s*<\/th>/);
  expect(html).toMatch(/<td\b[^>]*>\s*3\s*<\/td>/);
  expect(html).toContain("<ul>");
  expect(html).toContain("<strong>Approved</strong>");
  expect(html).toContain("<blockquote>");
  expect(html).toContain("Reviewed by finance.");
});

test("keeps fenced source code literal instead of parsing embedded markup", () => {
  const html = render(
    ["```tsx", "const content = <strong>not an element</strong>;", "```"].join(
      "\n",
    ),
  );

  expect(html).toContain("<pre>");
  expect(html).toContain("<code");
  expect(html).toContain("&lt;strong&gt;not an element&lt;/strong&gt;");
  expect(html).not.toContain("<strong>not an element</strong>");
});

test("preserves links and escapes query parameters in attributes", () => {
  const html = render(
    "See [the document](https://example.test/report?month=1&status=final).",
  );

  expect(html).toContain(
    'href="https://example.test/report?month=1&amp;status=final"',
  );
  expect(html).toContain(">the document</a>");
});

test("applies heading and custom component overrides in document content", () => {
  const Signer = ({ children }: PropsWithChildren) => (
    <span data-signer="present">{children}</span>
  );
  const html = renderToStaticMarkup(
    <Markdown
      options={{
        overrides: {
          h2: { props: { className: "report-heading" } },
          Signer: { component: Signer },
        },
      }}
    >
      {"## Signatories\n\n<Signer>Jane Smith</Signer> signed the report."}
    </Markdown>,
  );

  expect(html).toMatch(/<h2\b[^>]*class="report-heading"/);
  expect(html).toContain('data-signer="present"');
  expect(html).toContain("Jane Smith");
  expect(html).toContain("signed the report.");
});

test("table of contents includes real headings but not headings in code fences", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ level, children }) => (
        <span data-toc-level={level}>{children}</span>
      )}
    >
      {[
        "# Overview",
        "",
        "<Toc />",
        "",
        "```md",
        "## Not a section",
        "```",
        "",
        "### Details",
      ].join("\n")}
    </Markdown>,
  );

  const levels = Array.from(
    html.matchAll(/data-toc-level="(\d+)"/g),
    ([, level]) => Number(level),
  );
  expect(levels).toEqual([1, 3]);
  expect(html).toContain("Overview");
  expect(html).toContain("Details");
  expect(html).toContain("Not a section");
});

test("allows document components inside Markdown via overrides", () => {
  const html = renderToStaticMarkup(
    <Markdown options={{ overrides: { PageBreak: { component: PageBreak } } }}>
      {"Before\n\n<PageBreak />\n\n# After"}
    </Markdown>,
  );

  expect(html).toContain("Before");
  expect(html).toContain('class="react-print-page-break');
  expect(html).toMatch(/<h1\b[^>]*>After<\/h1>/);
});
