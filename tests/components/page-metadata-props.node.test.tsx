import { renderToStaticMarkup } from "react-dom/server";
import { PageNumber, PagesNumber, RunningH1, RunningH6 } from "react-print-pdf";
import { expect, test } from "vitest";

test("page counters forward standard span attributes without losing their counter classes", () => {
  const html = renderToStaticMarkup(
    <>
      <PageNumber
        id="current-page"
        className="page-counter"
        style={{ color: "navy" }}
        title="Current page"
        aria-label="Page number"
        data-number="current"
      />
      <PagesNumber
        counterStyle="lower-roman"
        className="total-pages"
        aria-label="Total pages"
      />
    </>,
  );

  expect(html).toContain('id="current-page"');
  expect(html).toContain(
    'class="react-print-page-number-decimal page-counter"',
  );
  expect(html).toContain('style="color:navy"');
  expect(html).toContain('title="Current page"');
  expect(html).toContain('aria-label="Page number"');
  expect(html).toContain('data-number="current"');
  expect(html).toContain(
    'class="react-print-pages-number-lower-roman total-pages"',
  );
  expect(html).toContain('aria-label="Total pages"');
  expect(html).toContain("counter(page, decimal)");
  expect(html).toContain("counter(pages, lower-roman)");
});

test("running headers forward span attributes while preserving heading affixes", () => {
  const html = renderToStaticMarkup(
    <>
      <RunningH1
        before="Chapter: "
        after=" (cont.)"
        id="running-chapter"
        className="running-title"
        lang="en"
        style={{ fontWeight: "bold" }}
        aria-label="Current chapter"
      />
      <RunningH6 title="Deepest heading" />
    </>,
  );

  expect(html).toContain('id="running-chapter"');
  expect(html).toContain(
    'class="react-print-heading-contents react-print-h1-contents running-title"',
  );
  expect(html).toContain('style="font-weight:bold"');
  expect(html).toContain('lang="en"');
  expect(html).toContain('aria-label="Current chapter"');
  expect(html).toContain('data-before="Chapter: "');
  expect(html).toContain('data-after=" (cont.)"');
  expect(html).toContain('title="Deepest heading"');
  expect(html).toContain(
    'class="react-print-heading-contents react-print-h6-contents"',
  );
});
