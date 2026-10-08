import assert from "node:assert/strict";
import { createElement } from "react";
import * as root from "react-print-pdf";
import * as client from "react-print-pdf/client";
import * as mdx from "react-print-pdf/mdx";
import * as playwright from "react-print-pdf/playwright";

const entrypoints = [
  ["react-print-pdf", root, "compile", "index"],
  ["react-print-pdf/client", client, "compile", "client/index"],
  [
    "react-print-pdf/playwright",
    playwright,
    "compileWithPlaywright",
    "playwright/index",
  ],
  ["react-print-pdf/mdx", mdx, "useMDXComponents", "mdx"],
];

for (const [name, exports, exportName, entry] of entrypoints) {
  const resolved = import.meta.resolve(name);
  assert.ok(resolved.endsWith(`/dist/${entry}.js`), resolved);
  assert.equal(typeof exports[exportName], "function", name);
}

const html = await root.compile(createElement("h1", null, "Verdaccio ESM"));
assert.match(html, /Verdaccio ESM/);
console.log("ESM exports and compilation passed");
