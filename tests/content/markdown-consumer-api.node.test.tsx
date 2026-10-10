import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile, Markdown, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

test("programmatic consumers can provide Markdown and Tailwind children as createElement arguments", async () => {
  const html = await compile(
    createElement(
      Tailwind,
      { preflight: false },
      createElement(
        Markdown,
        { options: { forceBlock: true } },
        "# Programmatic report",
      ),
    ),
  );

  expect(html).toContain('id="programmatic-report"');
  expect(html).toContain("Programmatic report");
  expect(html).toContain("data-react-print-tailwind-start");
  expect(html).toContain("data-react-print-tailwind-end");
  expect(renderToStaticMarkup(createElement(Markdown, { options: {} }))).toBe(
    "",
  );
});

test("TOC renderers can link generated ids without creating #undefined links for JSX headings", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ id, children }) =>
        id ? <a href={`#${id}`}>{children}</a> : <span>{children}</span>
      }
    >
      {"# Markdown heading\n\n<Toc />\n\n"}
      <h2>JSX heading without an id</h2>
    </Markdown>,
  );

  expect(html).toContain('href="#markdown-heading"');
  expect(html).toContain("JSX heading without an id");
  expect(html).not.toContain('href="#undefined"');
});
