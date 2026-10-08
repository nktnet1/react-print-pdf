import { readFile } from "node:fs/promises";
import { jsx } from "@emotion/react";
import { compile } from "react-print-pdf";
import { expect, test } from "vitest";

test("extracts Emotion CSS without @emotion/server", async () => {
  const html = await compile(
    jsx(
      "div",
      {
        css: {
          color: "#123456",
          marginInline: "8px",
        },
        "data-emotion-fixture": "true",
      },
      "Emotion fixture",
    ),
    { emotion: true },
  );

  expect(html).toContain("Emotion fixture");
  expect(html).toContain("#123456");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).not.toContain("<style data-emotion");
});

test("browser bundle has no Emotion server or Node stream imports", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
  };
  const clientBundle = await readFile(
    new URL("../dist/client/index.js", import.meta.url),
    "utf8",
  );

  expect(packageJson.dependencies?.["@emotion/server"]).toBeUndefined();
  expect(clientBundle).not.toContain("@emotion/server");
  expect(clientBundle).not.toContain("html-tokenize");
  expect(clientBundle).not.toContain("multipipe");
  expect(clientBundle).not.toMatch(
    /(?:from\s*|import\()(["'])(?:node:)?(?:stream|events)\1/,
  );
  expect(clientBundle).not.toMatch(
    /require\(\s*(["'])(?:node:)?(?:stream|events)\1\s*\)/,
  );
});
