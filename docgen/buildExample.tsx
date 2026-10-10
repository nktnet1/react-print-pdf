import type { CompileOptions } from "#/compile/compile";
import { formatExampleSource } from "#docgen/exampleSource";
import { baseCss, renderPreview } from "#docgen/renderPreview";
import type { EnrichedExample } from "#docgen/types";

export const buildExample = async (
  example: EnrichedExample,
  component: string,
  compileOptions?: CompileOptions,
) => {
  let markdown = ``;

  const source = await formatExampleSource(example, component);

  const paths = await renderPreview(
    example.template,
    component,
    true,
    compileOptions,
  );

  if (example.description) {
    markdown += `${example.description}\n\n`;
  }

  markdown += `<Frame background="subtle"><PreviewImage src="${paths.imagePath}" /></Frame>\n\n`;

  // Check if the folder docs/previews contain the image

  markdown += `<div style={{paddingTop: "1rem", paddingBottom: "1rem"}}><CodeBlocks>
<CodeBlock title="template.tsx">
\`\`\`tsx
${source}
\`\`\`
</CodeBlock>
<CodeBlock title="styles.css">
\`\`\`css
${baseCss}
\`\`\`
</CodeBlock>
</CodeBlocks></div>\n\n`;

  // markdown += `<a href="${pdfPath}">Download the PDF example ↓</a>\n\n`;

  return {
    markdown,
  };
};
