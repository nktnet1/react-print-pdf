import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// A printed document must not depend on a CDN or on relative font files that
// aren't present when Playwright/Gotenberg loads compiled HTML. Embed KaTeX's
// own matching CSS and WOFF2 fonts in the published browser/server bundles.
// The CSS transform runs at build/test-config time, not in the consumer runtime.
const require = createRequire(import.meta.url);
const stylesheetPath = require.resolve("katex/dist/katex.min.css");
const original = readFileSync(stylesheetPath, "utf8");
let embeddedFonts = 0;
const standalone = original.replace(
  /url\(fonts\/(KaTeX_[A-Za-z0-9-]+)\.woff2\) format\("woff2"\),url\(fonts\/\1\.woff\) format\("woff"\),url\(fonts\/\1\.ttf\) format\("truetype"\)/g,
  (_match, family: string) => {
    const bytes = readFileSync(
      join(dirname(stylesheetPath), "fonts", `${family}.woff2`),
    );
    embeddedFonts++;
    return `url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2")`;
  },
);

if (embeddedFonts === 0 || /url\(fonts\//.test(standalone)) {
  throw new Error("KaTeX font assets have changed; cannot make offline CSS");
}

export const katexCssDefines = {
  __REACT_PRINT_KATEX_CSS__: JSON.stringify(standalone),
};
