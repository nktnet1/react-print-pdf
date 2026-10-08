import assert from "node:assert/strict";
import { styleText } from "node:util";
import { Global, jsx } from "@emotion/react";
import { createElement } from "react";
import * as root from "react-print-pdf";
import * as client from "react-print-pdf/client";
import * as mdx from "react-print-pdf/mdx";
import * as playwright from "react-print-pdf/playwright";
import compilation from "./assert-compilation.cjs";

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

await compilation.verifyConsumerCompilation({
  format: "ESM",
  root,
  client,
  createElement,
  Global,
  jsx,
});
console.log(
  `ESM exports and installed-package compilation ${styleText("green", "passed")}`,
);
