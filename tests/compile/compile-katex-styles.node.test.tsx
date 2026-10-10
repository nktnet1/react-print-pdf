import { expect, test } from "vitest";
import { compile, deduplicateKatexStyles } from "#/compile/compile";
import { Latex } from "#/latex/latex";

const resource =
  '<style href="react-print-pdf-katex">.katex{font:12px KaTeX}</style>';
const hoisted =
  '<style data-href="react-print-pdf-katex">.katex{font:12px KaTeX}</style>';

test("keeps only one KaTeX stylesheet in React 18 server HTML", () => {
  expect(
    deduplicateKatexStyles(
      `<main>${resource}<span>x</span>${resource}<span>y</span></main>`,
    ),
  ).toBe(`<main>${resource}<span>x</span><span>y</span></main>`);
});

test("preserves React 19 hoisted KaTeX styles and unrelated styles", () => {
  const document = `<style>.custom{color:red}</style>${hoisted}<main>${resource}</main>`;
  expect(deduplicateKatexStyles(document)).toBe(
    `<style>.custom{color:red}</style>${hoisted}<main></main>`,
  );
});

test("leaves documents without LaTeX untouched", () => {
  const document =
    "<main><style>.something{color:blue}</style><p>hello</p></main>";
  expect(deduplicateKatexStyles(document)).toBe(document);
});

test.each([false, true])(
  "compile() includes one KaTeX stylesheet with emotion=%s",
  async (emotion) => {
    const html = await compile(
      <main>
        <Latex>{"x^2"}</Latex>
        <Latex>{"y^3"}</Latex>
      </main>,
      { emotion },
    );

    expect(html.match(/(?:data-)?href="react-print-pdf-katex"/g)).toHaveLength(
      1,
    );
    expect(html.match(/class="katex-mathml"/g)).toHaveLength(2);
  },
);
