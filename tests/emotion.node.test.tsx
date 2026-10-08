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

test("collects inline Emotion style tags into the resulting stylesheet", async () => {
  const html = await compile(
    <main>
      <style data-emotion="legacy custom">
        {".inline-emotion { color: rgb(11, 22, 33); }"}
      </style>
      <span className="inline-emotion">Inline style</span>
    </main>,
    { emotion: true },
  );

  expect(html).toContain("Inline style");
  expect(html).toMatch(/\.inline-emotion\s*\{[^}]*color:/);
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
});
