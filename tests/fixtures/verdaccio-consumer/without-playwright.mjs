import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { styleText } from "node:util";
import { createElement } from "react";
import * as esmRoot from "react-print-pdf";
import * as esmClient from "react-print-pdf/client";

const require = createRequire(import.meta.url);

// A normal consumer of the root or /client entrypoint must not need the
// optional Playwright peer or have it silently installed by npm.
assert.throws(() => require.resolve("playwright"), {
  code: "MODULE_NOT_FOUND",
});

for (const [entrypoint, exports] of [
  ["ESM root", esmRoot],
  ["ESM client", esmClient],
  ["CJS root", require("react-print-pdf")],
  ["CJS client", require("react-print-pdf/client")],
]) {
  assert.equal(typeof exports.compile, "function", entrypoint);
  const html = await exports.compile(
    createElement("h1", null, `No Playwright: ${entrypoint}`),
  );
  assert.ok(html.includes(`No Playwright: ${entrypoint}`), entrypoint);
}

console.log(
  `Optional Playwright peer compatibility ${styleText("green", "passed")}`,
);
