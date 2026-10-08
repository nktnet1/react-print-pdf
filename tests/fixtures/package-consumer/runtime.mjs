import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import * as esmRoot from "react-print-pdf";
import * as esmClient from "react-print-pdf/client";
import * as esmMdx from "react-print-pdf/mdx";
import * as esmPlaywright from "react-print-pdf/playwright";

const require = createRequire(import.meta.url);
const cjsRoot = require("react-print-pdf");
const cjsClient = require("react-print-pdf/client");
const cjsPlaywright = require("react-print-pdf/playwright");
const cjsMdx = require("react-print-pdf/mdx");

for (const root of [esmRoot, cjsRoot]) {
  assert.equal(typeof root.compile, "function");
  assert.equal(typeof root.Markdown, "function");
  assert.equal(typeof root.Tailwind, "function");
  assert.equal(typeof root.convertHtmlWithGotenberg, "function");
}
for (const client of [esmClient, cjsClient]) {
  assert.equal(typeof client.compile, "function");
}
for (const playwright of [esmPlaywright, cjsPlaywright]) {
  assert.equal(typeof playwright.convertHtmlWithPlaywright, "function");
  assert.equal(typeof playwright.compileWithPlaywright, "function");
}
for (const mdx of [esmMdx, cjsMdx]) {
  assert.equal(typeof mdx.useMDXComponents, "function");
}

const html = await esmRoot.compile(createElement("h1", null, "Packaged ESM"));
assert.match(html, /Packaged ESM/);
const cjsHtml = await cjsRoot.compile(
  createElement("h1", null, "Packaged CJS"),
);
assert.match(cjsHtml, /Packaged CJS/);

console.log("package-exports-ok");
