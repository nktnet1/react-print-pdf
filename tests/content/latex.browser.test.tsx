import { createElement } from "react";
import { compile, Latex } from "react-print-pdf";
import { expect, test } from "vitest";

test("KaTeX loads bundled fonts without requesting an external stylesheet", async () => {
  const html = await compile(
    createElement(Latex, null, String.raw`\frac{1}{2}+\sqrt{x}`),
  );
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).not.toContain("cdn.jsdelivr.net");

  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);

  try {
    await document.fonts.ready;
    const mainFont = [...document.fonts].filter(
      (font) => font.family === "KaTeX_Main",
    );
    expect(mainFont.length).toBeGreaterThan(0);
    expect(mainFont.some((font) => font.status === "loaded")).toBe(true);
    expect(
      getComputedStyle(host.querySelector(".katex") as HTMLElement).fontFamily,
    ).toContain("KaTeX_Main");
  } finally {
    host.remove();
  }
});
