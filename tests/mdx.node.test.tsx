import { renderToStaticMarkup } from "react-dom/server";
import { useMDXComponents } from "react-print-pdf/mdx";
import { expect, test } from "vitest";

test("MDX paragraph overrides preserve rich children without adding a wrapper", () => {
  const { p: Paragraph } = useMDXComponents();
  const html = renderToStaticMarkup(
    <Paragraph>
      Before <strong>formatted</strong> after
    </Paragraph>,
  );

  expect(html).toContain("<strong>formatted</strong>");
  expect(html).not.toMatch(/<p(?:\s|>)/);
});
