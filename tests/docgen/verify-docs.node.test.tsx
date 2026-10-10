import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { verifyGeneratedDocs } from "../../scripts/verify-docs";

const roots: string[] = [];
const write = (root: string, path: string, content: string) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
};
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "react-print-docs-verify-"));
  roots.push(root);
  write(
    root,
    "docs/content/docs/components/compile.mdx",
    '<PreviewImage src="/docs/images/previews/compile-a/document.1.jpg" />',
  );
  write(root, "docs/content/docs/ui/templates/invoice.mdx", "# Invoice\n");
  write(root, "docs/content/docs/ui/index.mdx", "# Templates\n");
  write(root, "docs/content/docs/index.mdx", "# Home\n");
  write(
    root,
    "docs/public/docs/images/previews/compile-a/document.1.jpg",
    "jpeg",
  );
  write(root, "docs/public/docs/images/previews/compile-a/document.pdf", "pdf");
  return root;
};
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

test("accepts valid documentation and referenced preview assets", () => {
  const report = verifyGeneratedDocs(fixture());
  expect(report).toEqual({
    pages: 4,
    previews: 1,
    changedFiles: 0,
    issues: [],
  });
});

test("finds obsolete imports, missing images and missing PDFs", () => {
  const root = fixture();
  write(
    root,
    "docs/content/docs/components/compile.mdx",
    '<img src="/docs/images/previews/compile-a/document.1.jpg" />\nimport { Compile } from "@fileforge/react-print";',
  );
  rmSync(
    join(root, "docs/public/docs/images/previews/compile-a/document.1.jpg"),
  );
  write(root, "docs/public/docs/images/previews/compile-a/document.pdf", "");
  const report = verifyGeneratedDocs(root);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      expect.stringContaining("obsolete @fileforge/react-print"),
      expect.stringContaining("missing or empty preview:"),
      expect.stringContaining("missing or empty preview PDF:"),
    ]),
  );
});

test("rejects traversal URLs and notices empty generated directories", () => {
  const root = fixture();
  write(
    root,
    "docs/content/docs/components/compile.mdx",
    '<img src="/docs/images/previews/../private/document.jpg" />',
  );
  rmSync(join(root, "docs/content/docs/ui/templates"), { recursive: true });
  const report = verifyGeneratedDocs(root);
  expect(report.issues).toEqual(
    expect.arrayContaining([
      expect.stringContaining("escapes the preview directory"),
      expect.stringContaining("No generated template pages"),
    ]),
  );
});

test("freshness compares generated MDX/metadata with HEAD, not preview binaries", () => {
  const root = fixture();
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "add", "docs/content/docs"]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Docs Test",
    "-c",
    "user.email=docs@example.test",
    "commit",
    "-qm",
    "Fixture",
  ]);
  expect(verifyGeneratedDocs(root, { freshness: true }).issues).toEqual([]);

  write(
    root,
    "docs/public/docs/images/previews/compile-a/document.1.jpg",
    "different jpeg",
  );
  expect(verifyGeneratedDocs(root, { freshness: true }).changedFiles).toBe(0);

  write(
    root,
    "docs/content/docs/components/compile.mdx",
    "# New generated content\n",
  );
  write(root, "docs/content/docs/components/new-page.mdx", "# Extra page\n");
  write(root, "docs/content/docs/ui/templates/meta.json", '{"pages": []}\n');
  write(
    root,
    "docs/content/docs/getting-started/manual.mdx",
    "# Manually authored\n",
  );
  const report = verifyGeneratedDocs(root, { freshness: true });
  expect(report.changedFiles).toBe(3);
  expect(
    report.issues.filter((issue) => issue.includes("differ from HEAD")),
  ).toHaveLength(3);
  expect(
    readFileSync(
      join(root, "docs/content/docs/getting-started/manual.mdx"),
      "utf8",
    ),
  ).toContain("Manually");
});
