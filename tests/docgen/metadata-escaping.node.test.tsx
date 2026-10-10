import ts from "@typescript/typescript6";
import frontmatter from "front-matter";
import { expect, test } from "vitest";
import { buildFileMarkdown } from "../../docgen/buildFileMarkdown";
import {
  buildTemplateList,
  type buildTemplates,
} from "../../docgen/buildTemplates";

const specialTitle = 'Invoice: "Enterprise" #2';

test("component documentation preserves YAML-sensitive titles", async () => {
  const markdown = await buildFileMarkdown(
    {
      name: specialTitle,
      description: "Printable document",
      components: { Invoice: { client: true, server: true } },
    },
    [],
  );
  expect(frontmatter(markdown).attributes).toMatchObject({
    title: specialTitle,
    description: "Printable document",
  });
});

test("template listing keeps quoted card names valid JSX", async () => {
  const templates = [
    {
      name: specialTitle,
      category: 'Invoices: "Premium"',
      icon: "ReceiptTextIcon",
      path: "ui/templates/invoice-advanced",
      image: "/docs/images/previews/example/document.jpg",
      outputPath: "/tmp/invoice-advanced.mdx",
      markdown: "",
    },
  ] as Awaited<ReturnType<typeof buildTemplates>>;
  const markdown = await buildTemplateList(templates);
  const cards = markdown.match(/<CardGroup>[\s\S]*?<\/CardGroup>/)?.[0];
  expect(cards).toBeDefined();
  const result = ts.transpileModule(`const Document = () => (${cards});`, {
    fileName: "cards.tsx",
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  });
  expect(result.diagnostics ?? []).toEqual([]);
  expect(markdown).toContain(`title={${JSON.stringify(specialTitle)}}`);
});

test("template metadata preserves punctuation and newlines", async () => {
  const { docFrontmatter } = await import("../../docgen/mdxSerialization");
  const description = 'Annual report: "A & B"\nDraft #2';
  const metadata = {
    title: specialTitle,
    description,
    icon: "ReceiptTextIcon",
    category: 'Invoices: "Premium"',
  };
  expect(
    frontmatter(`${docFrontmatter(metadata)}# Document`).attributes,
  ).toEqual(metadata);
});
