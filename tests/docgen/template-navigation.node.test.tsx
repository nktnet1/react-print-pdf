import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  buildTemplateMetadata,
  type buildTemplates,
} from "../../docgen/buildTemplates";

vi.mock("#docgen/renderPreview", () => ({
  renderPreview: vi.fn(),
}));

type Template = Awaited<ReturnType<typeof buildTemplates>>[number];

const templateRoot = join("docs", "content", "docs", "ui", "templates");
const template = (path: string, category = "Invoices"): Template => ({
  name: path,
  category,
  icon: undefined,
  path: `ui/templates/${path}`,
  image: `/docs/images/previews/${path}/document.jpg`,
  outputPath: join(templateRoot, `${path}.mdx`),
  markdown: "",
});

test("template sidebar metadata points to distinct nested pages", () => {
  const result = buildTemplateMetadata(
    [
      template("domestic/invoice"),
      template("international/invoice"),
      template("receipt", "Receipts"),
    ],
    templateRoot,
  );
  expect(result).toEqual({
    title: "Examples",
    pages: [
      "---Invoices---",
      "./domestic/invoice",
      "./international/invoice",
      "---Receipts---",
      "receipt",
    ],
  });
});
