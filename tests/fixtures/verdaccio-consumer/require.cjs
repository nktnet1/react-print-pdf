const assert = require("node:assert/strict");
const { createElement } = require("react");

const entrypoints = [
  ["react-print-pdf", "compile", "index"],
  ["react-print-pdf/client", "compile", "client/index"],
  ["react-print-pdf/playwright", "compileWithPlaywright", "playwright/index"],
  ["react-print-pdf/mdx", "useMDXComponents", "mdx"],
];

for (const [name, exportName, entry] of entrypoints) {
  const resolved = require.resolve(name).replaceAll("\\", "/");
  assert.ok(resolved.endsWith(`/dist/${entry}.cjs`), resolved);
  assert.equal(typeof require(name)[exportName], "function", name);
}

const { compile } = require("react-print-pdf");
compile(createElement("h1", null, "Verdaccio CJS"))
  .then((html) => {
    assert.match(html, /Verdaccio CJS/);
    console.log("CommonJS exports and compilation passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
