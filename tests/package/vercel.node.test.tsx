import { readFile } from "node:fs/promises";
import { CSS, compile, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

const serverBundleUrl = new URL("../../dist/index.js", import.meta.url);

test("compiles plain CSS in a server runtime", async () => {
  const html = await compile(
    <>
      <CSS>{".report-title { color: rgb(18 52 86); }"}</CSS>
      <h1 className="report-title">Quarterly report</h1>
    </>,
  );

  expect(html).toContain("Quarterly report");
  expect(html).toContain(".report-title");
  expect(html).toContain("rgb(18 52 86)");
});

test("compiles Tailwind in a server runtime", async () => {
  const html = await compile(
    <Tailwind>
      <div className="rounded-lg bg-blue-500 p-4">Serverless report</div>
    </Tailwind>,
  );

  expect(html).toContain("Serverless report");
  expect(html).toMatch(/\.bg-blue-500\s*\{[^}]*background-color:/);
  expect(html).toMatch(/\.rounded-lg\s*\{[^}]*border-radius:/);
  expect(html).toMatch(/\.p-4\s*\{[^}]*padding:/);
  expect(html).toContain("box-sizing");
  expect(html).not.toContain("data-react-print-tailwind-");
});

test("server bundle does not resolve Tailwind from the consumer filesystem", async () => {
  const serverBundle = await readFile(serverBundleUrl, "utf8");

  expect(serverBundle).not.toContain("@mhsdesign/jit-browser-tailwindcss");
  expect(serverBundle).not.toMatch(/node_modules[\\/]tailwindcss[\\/]/);
  expect(serverBundle).not.toMatch(
    /(?:from\s*|import\()\s*["']tailwindcss(?:\/[^"']*)?["']/,
  );
  expect(serverBundle).not.toMatch(
    /require\(\s*["']tailwindcss(?:\/[^"']*)?["']\s*\)/,
  );
});
