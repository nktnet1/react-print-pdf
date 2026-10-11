const assert = require("node:assert/strict");
const { styleText } = require("node:util");
const { Global, jsx } = require("@emotion/react");
const { createElement } = require("react");
const { verifyConsumerCompilation } = require("./assert-compilation.cjs");

const entrypoints = [
  ["react-print-pdf", "compile", "dist/index.cjs"],
  ["react-print-pdf/client", "compile", "dist/client/index.cjs"],
  ["react-print-pdf/compiler", "compile", "compiler.cjs"],
  ["react-print-pdf/components", "Tailwind", "dist/components/index.cjs"],
  [
    "react-print-pdf/playwright",
    "compileWithPlaywright",
    "dist/playwright/index.cjs",
  ],
  ["react-print-pdf/mdx", "useMDXComponents", "dist/mdx.cjs"],
];

for (const [name, exportName, entry] of entrypoints) {
  const resolved = require.resolve(name).replaceAll("\\", "/");
  assert.ok(resolved.endsWith(`/${entry}`), resolved);
  assert.equal(typeof require(name)[exportName], "function", name);
}

verifyConsumerCompilation({
  format: "CJS",
  root: require("react-print-pdf"),
  client: require("react-print-pdf/client"),
  createElement,
  Global,
  jsx,
})
  .then(() => {
    console.log(
      `CommonJS exports and installed-package compilation ${styleText("green", "passed")}`,
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
