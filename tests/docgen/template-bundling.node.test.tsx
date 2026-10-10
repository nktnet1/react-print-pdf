import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { bundleTemplate } from "../../docgen/bundleTemplate";

const templateRoot = fileURLToPath(
  new URL("../../src/ui/templates/", import.meta.url),
);

test("every maintained MDX template bundles for the documentation generator", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "react-print-mdx-bundling-"));

  try {
    for (const filename of readdirSync(templateRoot)
      .filter((name) => name.endsWith(".mdx"))
      .sort()) {
      const modulePath = await bundleTemplate(
        join(templateRoot, filename),
        outputRoot,
      );
      expect(existsSync(modulePath), `${filename} bundle exists`).toBe(true);
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}, 90_000);

test("the report template renders its charts as printable SVG without browser hydration", async () => {
  // Load the compiled maintained example, not a separate hard-coded fixture.
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const cacheRoot = join(projectRoot, ".tmp");
  mkdirSync(cacheRoot, { recursive: true });
  const outputRoot = mkdtempSync(join(cacheRoot, "report-chart-ssr-"));

  try {
    const entrypoint = await bundleTemplate(
      join(templateRoot, "report-charts.mdx"),
      outputRoot,
    );
    const { default: Report, dailyData } = (await import(
      pathToFileURL(entrypoint).href
    )) as {
      default: ComponentType;
      dailyData: { date: number }[];
    };

    const html = renderToStaticMarkup(createElement(Report));
    const days = Array.from(
      html.matchAll(/data-energy-day="(\d{4}-\d{2}-\d{2})"/g),
      (match) => match[1],
    );

    expect(dailyData.length).toBeGreaterThan(14);
    expect(html).toContain('aria-label="Consommation quotidienne par énergie"');
    expect((html.match(/<svg\b/g) ?? []).length).toBe(3);
    expect(days).toHaveLength(dailyData.length);
    expect(new Set(days).size).toBe(dailyData.length);
    // Each daily bar has three fuel segments, and each half-pie has three
    // slices. Server HTML must carry those SVG primitives, not blank widgets.
    expect((html.match(/<rect\b/g) ?? []).length).toBe(dailyData.length * 3);
    expect((html.match(/<path\b/g) ?? []).length).toBe(6);
    expect(html).not.toMatch(/\b(?:NaN|undefined)\b/);
    expect(html).not.toContain("recharts-wrapper");

    // Verify the public compilation path retains the charts in print-ready HTML.
    const { compile } = await import("react-print-pdf");
    const printableHtml = await compile(createElement(Report));
    expect((printableHtml.match(/<svg\b/g) ?? []).length).toBe(3);
    expect((printableHtml.match(/<rect\b/g) ?? []).length).toBe(
      dailyData.length * 3,
    );
    expect((printableHtml.match(/<path\b/g) ?? []).length).toBe(6);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}, 30_000);
