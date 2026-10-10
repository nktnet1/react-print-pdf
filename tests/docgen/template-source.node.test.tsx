import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { describe, expect, test } from "vitest";
import { __docConfig as cssDocumentation } from "#/css/css";

const templatesDirectory = fileURLToPath(
  new URL("../../src/ui/templates/", import.meta.url),
);

const readTemplate = (name: string) =>
  readFileSync(
    new URL(`../../src/ui/templates/${name}`, import.meta.url),
    "utf8",
  );

// CSS in the maintained MDX examples is written as literal JSX children of
// <CSS>. Check the actual CSS declarations before they are copied to the
// generated documentation pages, which can otherwise hide malformed rules.
const cssLiteralPattern =
  /<CSS\b[^>]*>\s*\{\s*(?:String\.raw\s*)?`([\s\S]*?)`\s*\}\s*<\/CSS>/g;

const money = (value: string) => Number(value.replaceAll(",", ""));

describe("maintained consumer templates", () => {
  test("every literal CSS example parses as a complete stylesheet", () => {
    for (const file of readdirSync(templatesDirectory).filter((name) =>
      name.endsWith(".mdx"),
    )) {
      const source = readTemplate(file);
      const styles = [...source.matchAll(cssLiteralPattern)];
      if (source.includes("<CSS")) {
        expect(
          styles.length,
          `${file}: inspect the CSS example`,
        ).toBeGreaterThan(0);
      }

      for (const [index, match] of styles.entries()) {
        expect(
          () =>
            postcss.parse(match[1], {
              from: `${file} stylesheet ${index + 1}`,
            }),
          `${file}: invalid CSS snippet ${index + 1}`,
        ).not.toThrow();
      }
    }
  });

  test("basic invoice date matches its billing period", () => {
    const source = readTemplate("invoice.mdx");
    expect(source).toContain("January 2024");
    expect(source).toContain("February 1, 2024");
  });

  test("advanced invoice keeps its identity, parties, and totals consistent", () => {
    const source = readTemplate("invoice-advanced.mdx");
    const invoiceNumbers = [...source.matchAll(/Invoice #(\d+)/g)].map(
      (match) => match[1],
    );
    expect(invoiceNumbers.length).toBeGreaterThan(1);
    expect(new Set(invoiceNumbers).size).toBe(1);

    const rowAmounts = [
      ...source.matchAll(/<td className="text-right py-3">\$([\d,.]+)<\/td>/g),
    ].map((match) => money(match[1]));
    expect(rowAmounts).toHaveLength(4);
    const calculatedTotal = rowAmounts[1] + rowAmounts[3];
    const statedTotals = [...source.matchAll(/<b>\$([\d,.]+)<\/b>/g)].map(
      (match) => money(match[1]),
    );
    expect(statedTotals.length).toBeGreaterThanOrEqual(2);
    for (const total of statedTotals) {
      expect(total).toBe(calculatedTotal);
    }

    expect(source).toMatch(/Payee[\s\S]*?Acme Inc\.[\s\S]*?Payor/);
    expect(source).toMatch(/Payor[\s\S]*?Example Client Ltd/);
  });

  test("CSS component describes its escaping without claiming sanitisation", () => {
    expect(cssDocumentation.description).toContain(
      "does **not** validate or sanitise",
    );
    expect(cssDocumentation.description).toContain("trusted stylesheet");
  });
});
