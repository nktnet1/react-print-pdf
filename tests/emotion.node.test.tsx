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
