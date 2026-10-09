import { renderToStaticMarkup } from "react-dom/server";
import { Latex } from "react-print-pdf";
import { expect, test } from "vitest";

test("renders a fraction and root with accessible MathML", () => {
  const html = renderToStaticMarkup(
    <Latex>{String.raw`\frac{1}{2} + \sqrt{x}`}</Latex>,
  );

  expect(html).toContain('class="katex"');
  expect(html).toContain('class="katex-mathml"');
  expect(html).toMatch(/<math\b/);
  expect(html).toMatch(/<mfrac\b/);
  expect(html).toMatch(/<msqrt\b/);
  expect(html).toContain('data-href="react-print-pdf-katex"');
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).not.toContain("cdn.jsdelivr.net");
  expect(html).not.toMatch(/url\(fonts\//);
});

test("renders an integral without losing LaTeX backslashes", () => {
  const html = renderToStaticMarkup(
    <Latex>{String.raw`\int_0^\infty e^{-x^2}\,dx`}</Latex>,
  );

  expect(html).toContain('class="katex"');
  expect(html).toContain("<math");
  expect(html).toContain("\u222b");
  expect(html).not.toContain('class="katex-error"');
});

test("renders invalid LaTeX as visible error text rather than throwing", () => {
  const html = renderToStaticMarkup(
    <Latex>{String.raw`\notARealCommand{1}`}</Latex>,
  );

  expect(html).toContain(String.raw`\notARealCommand`);
  expect(html).toMatch(/<mtext>\\notARealCommand<\/mtext>/);
  expect(html).toMatch(/<mstyle\b[^>]*mathcolor=/);
});

test("does not interpret script markup embedded in a formula as HTML", () => {
  const html = renderToStaticMarkup(
    <Latex>{String.raw`\text{Value <script>alert(1)</script>}`}</Latex>,
  );

  expect(html).toContain("Value");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("</script>");
});

test("does not share or discard the MathML for separate formulas", () => {
  const html = renderToStaticMarkup(
    <>
      <Latex>{"x^2"}</Latex>
      <Latex>{"y^3"}</Latex>
    </>,
  );

  expect(html.match(/class="katex-mathml"/g)).toHaveLength(2);
  expect(html).toContain("<mn>2</mn>");
  expect(html).toContain("<mn>3</mn>");
  expect(html.match(/data-href="react-print-pdf-katex"/g)).toHaveLength(1);
});
