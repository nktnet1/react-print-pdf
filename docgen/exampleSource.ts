import type { EnrichedExample } from "#docgen/types";
import { formatSnippet } from "#docgen/utils";

/** Format a copyable document component without relying on implicit imports. */
export const formatExampleSource = (
  example: Pick<
    EnrichedExample,
    "templateString" | "imports" | "externalImports"
  >,
  component: string,
) => {
  const imports = [...new Set([component, ...(example.imports ?? [])])];

  return formatSnippet(`import React from "react";
import { ${imports.join(", ")} } from "react-print-pdf";
${(example.externalImports ?? []).join("\n")}

export const Document = () => (${example.templateString});`);
};
