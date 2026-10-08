import { compile, Latex, Markdown, PageBreak } from "react-print-pdf";
import { expect, test } from "vitest";

test("compiles Markdown text around an embedded LaTeX formula", async () => {
  const html = await compile(
    <article>
      <Markdown options={{ forceBlock: true }}>
        {"# Results\n\nThe ratio is "}
        <Latex>{String.raw`\frac{1}{2}`}</Latex>
        {" and is **verified**."}
      </Markdown>
    </article>,
  );

  expect(html).toMatch(/<h1\b[^>]*>Results<\/h1>/);
  expect(html).toContain("The ratio is");
  expect(html).toContain('class="katex"');
  expect(html).toMatch(/<mfrac\b/);
  expect(html).toContain("<strong>verified</strong>");
  expect(html).not.toContain("[object Object]");
  const before = html.indexOf("The ratio is");
  const formula = html.indexOf('class="katex"');
  const after = html.indexOf("<strong>verified</strong>");
  expect(before).toBeLessThan(formula);
  expect(formula).toBeLessThan(after);
});

test("compiles a Markdown report with a heading and custom page break", async () => {
  const html = await compile(
    <Markdown options={{ overrides: { PageBreak: { component: PageBreak } } }}>
      {"# Front matter\n\n<PageBreak />\n\n## Report body"}
    </Markdown>,
  );

  expect(html).toMatch(/<h1\b[^>]*>Front matter<\/h1>/);
  expect(html).toMatch(/<h2\b[^>]*>Report body<\/h2>/);
  expect(html).toContain('class="react-print-page-break');
  expect(html).toContain("page-break-after: always");
});
