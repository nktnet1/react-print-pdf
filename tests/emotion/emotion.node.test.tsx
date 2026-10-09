import { Global, jsx } from "@emotion/react";
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

test("combines global and component Emotion CSS on the server", async () => {
  const html = await compile(
    <>
      <Global styles={{ ".report-global": { color: "#235678" } }} />
      {jsx(
        "p",
        { className: "report-global", css: { paddingInlineStart: "9px" } },
        "Global and scoped styles",
      )}
    </>,
    { emotion: true },
  );

  expect(html).toContain("Global and scoped styles");
  expect(html).toContain(".report-global");
  expect(html).toContain("#235678");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).toMatch(/padding-(?:left|right|inline-start):\s*9px/);
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
});

test("merges multiple Emotion style tags while preserving ordinary styles", async () => {
  const html = await compile(
    <main>
      <style data-emotion="first inline">
        {".from-first { color: #123456; }"}
      </style>
      <style id="ordinary-print-css">
        {".ordinary { font-weight: bold; }"}
      </style>
      <style data-emotion="second inline">
        {".from-second { color: #654321; }"}
      </style>
      <span className="from-first from-second">Multiple style tags</span>
    </main>,
    { emotion: true },
  );

  expect(html).toMatch(/\.from-first\s*\{[^}]*#123456/);
  expect(html).toMatch(/\.from-second\s*\{[^}]*#654321/);
  expect(html).toContain('id="ordinary-print-css"');
  expect(html).toContain(".ordinary { font-weight: bold; }");
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
  expect(html).toContain("Multiple style tags");
});

test("preserves ordinary style tags whose attributes merely end in data-emotion", async () => {
  const html = await compile(
    <main>
      <style data-widget-data-emotion="unrelated">
        {".keep-custom-style { border-color: #123abc; }"}
      </style>
      <style data-description="Mention data-emotion='not-an-attribute'">
        {".also-preserved { color: #224466; }"}
      </style>
      <style data-emotion="emotion inline">
        {".real-emotion-style { color: #456def; }"}
      </style>
      <p className="keep-custom-style real-emotion-style">Preserved CSS</p>
    </main>,
    { emotion: true },
  );

  expect(html).toContain('data-widget-data-emotion="unrelated"');
  expect(html).toContain(".keep-custom-style { border-color: #123abc; }");
  expect(html).toContain('data-description="Mention data-emotion=');
  expect(html).toContain(".also-preserved { color: #224466; }");
  expect(html).toContain(".real-emotion-style");
  expect(html).not.toContain('data-emotion="emotion inline"');
});
