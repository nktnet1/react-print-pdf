import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  replaceGeneratedTemplatePages,
  writeGeneratedMarkdown,
} from "../../docgen/writeMarkdown";

test("docgen writes flat and nested MDX pages as files, not directories", () => {
  const root = mkdtempSync(join(tmpdir(), "react-print-docgen-output-"));
  try {
    for (const [relativePath, content] of [
      ["compile.mdx", "# Compile\n"],
      ["css/font.mdx", "# Font\n"],
      ["ui/templates/invoice.mdx", "# Invoice\n"],
    ]) {
      const outputPath = join(root, relativePath);
      writeGeneratedMarkdown(outputPath, content);
      expect(statSync(outputPath).isFile(), relativePath).toBe(true);
      expect(readFileSync(outputPath, "utf8"), relativePath).toBe(content);
    }

    const outputPath = join(root, "css/font.mdx");
    writeGeneratedMarkdown(outputPath, "# Updated Font\n");
    expect(readFileSync(outputPath, "utf8")).toBe("# Updated Font\n");
    expect(existsSync(join(outputPath, "meta.json"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("template regeneration prunes removed pages but preserves other docs", () => {
  const root = mkdtempSync(join(tmpdir(), "react-print-docgen-templates-"));
  try {
    const directory = join(root, "ui");
    const old = join(directory, "templates/removed.mdx");
    const next = join(directory, "templates/invoice.mdx");
    const landing = join(directory, "index.mdx");
    writeGeneratedMarkdown(old, "# Removed template\n");
    writeGeneratedMarkdown(join(directory, "templates/meta.json"), "{}");
    writeGeneratedMarkdown(landing, "# All templates\n");

    replaceGeneratedTemplatePages(directory, [
      { outputPath: next, markdown: "# Current invoice\n" },
    ]);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(join(directory, "templates/meta.json"))).toBe(true);
    expect(readFileSync(next, "utf8")).toBe("# Current invoice\n");
    expect(readFileSync(landing, "utf8")).toBe("# All templates\n");

    replaceGeneratedTemplatePages(directory, []);
    expect(existsSync(next)).toBe(false);
    expect(statSync(directory).isDirectory()).toBe(true);
    expect(readFileSync(landing, "utf8")).toBe("# All templates\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid template destinations cannot wipe existing generated pages", () => {
  const root = mkdtempSync(join(tmpdir(), "react-print-docgen-templates-"));
  try {
    const directory = join(root, "ui");
    const existing = join(directory, "templates/invoice.mdx");
    writeGeneratedMarkdown(existing, "# Keep this\n");

    expect(() =>
      replaceGeneratedTemplatePages(directory, [
        { outputPath: join(root, "elsewhere.mdx"), markdown: "# Bad\n" },
      ]),
    ).toThrow("outside");
    expect(readFileSync(existing, "utf8")).toBe("# Keep this\n");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
