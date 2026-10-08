import type { CompileOptions } from "#/compile/compile";
import { baseCss, renderPreview } from "#docgen/renderPreview";
import type { EnrichedExample } from "#docgen/types";
import { formatSnippet } from "#docgen/utils";

export const buildExample = async (
  example: EnrichedExample,
  component: string,
  compileOptions?: CompileOptions,
) => {
  let markdown = ``;

  const snippet = await formatSnippet(example.templateString);

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
\`\`\`jsx
import { ${component}${
    example.imports ? `, ${example.imports.join(", ")}` : ""
  } } from "react-print-pdf";${
    example.externalImports ? `\n${example.externalImports.join("\n")}` : ""
  }

${snippet}
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
