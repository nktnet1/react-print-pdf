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
import { writeGeneratedMarkdown } from "../../docgen/writeMarkdown";

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
