import frakturFontUrl from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?url";
import mainFontUrl from "katex/dist/fonts/KaTeX_Main-Regular.woff2?url";
import { compile, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

const fontCss = (family: string, fontUrl: string, fallback: boolean) =>
  `@font-face {
    font-family: ${family};
    src: url("${fontUrl}") format("woff2");
    font-weight: 400;
  }
  @theme { --font-local: ${family}${fallback ? ", serif" : ""}; }`;

const documentWithFont = async (
  family: string,
  fontUrl: string,
  fallback: boolean,
) =>
  compile(
    <Tailwind preflight={false} stylesheet={fontCss(family, fontUrl, fallback)}>
      <span
        className="font-local"
        style={{ fontSize: "64px", display: "inline-block" }}
      >
        WWWWWWWWWW
      </span>
    </Tailwind>,
  );

// Measure fonts rather than just computed font-family names: two CSS faces
// sharing a name report the same computed value even when both use one face.
test.each([
  { name: "single-word names", family: "SharedFont", fallback: false },
  { name: "quoted names with spaces", family: '"Shared Font"', fallback: true },
  { name: "unquoted names with spaces", family: "Shared Font", fallback: true },
])(
  "independent Tailwind regions isolate @font-face with $name",
  async ({ family, fallback }) => {
    const htmls = await Promise.all([
      documentWithFont('"Reference A"', mainFontUrl, false),
      documentWithFont('"Reference B"', frakturFontUrl, false),
      documentWithFont(family, mainFontUrl, fallback),
      documentWithFont(family, frakturFontUrl, fallback),
    ]);
    const host = document.createElement("div");
    document.body.append(host);
    try {
      host.innerHTML = htmls
        .map(
          (html, index) =>
            `<section data-font-index="${index}">${html}</section>`,
        )
        .join("");
      await document.fonts.ready;

      const widths = htmls.map((_, index) => {
        const element = host.querySelector<HTMLElement>(
          `[data-font-index="${index}"] span`,
        );
        if (!element) throw new Error(`Missing font fixture: ${index}`);
        return element.getBoundingClientRect().width;
      });

      expect(widths[0]).not.toBe(widths[1]);
      expect(widths[2]).toBeCloseTo(widths[0], 0);
      expect(widths[3]).toBeCloseTo(widths[1], 0);
    } finally {
      host.remove();
    }
  },
  30_000,
);
