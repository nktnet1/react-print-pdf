import { createElement } from "react";
import { expect, test, vi } from "vitest";
import { buildExample } from "../../docgen/buildExample";

vi.mock("#docgen/renderPreview", () => ({
  baseCss: Buffer.from("body { margin: 0; }"),
  renderPreview: vi.fn().mockResolvedValue({
    imagePath: "/docs/images/previews/example/document.jpg",
    pdfPath: "/docs/images/previews/example/document.pdf",
  }),
}));

test("copyable component examples label TypeScript JSX as TSX", async () => {
  const { markdown } = await buildExample(
    {
      template: createElement("main", null, "Example"),
      templateString: "<main>{(([value]: [number]) => value)([1])}</main>",
      externalImports: ['import type { ReactNode } from "react";'],
    },
    "Markdown",
  );

  expect(markdown).toContain('<CodeBlock title="template.tsx">\n```tsx\n');
  expect(markdown).toContain('import type { ReactNode } from "react";');
  expect(markdown).toContain("([value]: [number]) => value");
  expect(markdown).toContain('<CodeBlock title="styles.css">\n```css\n');
});
