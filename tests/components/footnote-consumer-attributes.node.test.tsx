import { renderToStaticMarkup } from "react-dom/server";
import { compile, Footnote } from "react-print-pdf";
import { expect, test } from "vitest";

test("Footnote retains its paged-media class when consumers add classes", () => {
  const html = renderToStaticMarkup(
    <Footnote className="reference-note" id="note-1">
      Additional context
    </Footnote>,
  );

  expect(html).toContain(
    'class="react-print-footnote text-left text-xs font-normal reference-note"',
  );
  expect(html).toContain('id="note-1"');
});

test("Footnote forwards standard span attributes through compilation", async () => {
  const html = await compile(
    <p>
      The result
      <Footnote
        aria-label="Source explanation"
        data-source="report"
        style={{ color: "navy" }}
        title="Source"
      >
        <strong>Verified</strong> independently.
      </Footnote>
    </p>,
  );

  expect(html).toContain(
    'class="react-print-footnote text-left text-xs font-normal"',
  );
  expect(html).toContain('aria-label="Source explanation"');
  expect(html).toContain('data-source="report"');
  expect(html).toContain('style="color:navy"');
  expect(html).toContain("<strong>Verified</strong> independently.");
});
