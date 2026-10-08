import * as prettier from "prettier";
import ts, { type Expression, type ObjectLiteralExpression } from "typescript";
import type {
  DocConfig,
  EnrichedExample,
  ExtendedDocConfig,
} from "#docgen/types.ts";

export const formatCamelCaseToTitle = (str: string) => {
  // Convert camelCase to Title Case with spaces
  return str
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase());
};

const listProperties = (node: ts.ObjectLiteralExpression) => {
  const properties: Record<string, Expression> = {};

  node.properties.forEach((property) => {
    if (ts.isPropertyAssignment(property)) {
      properties[property.name.getText()] = property.initializer;
    }
  });

  return properties;
};

type TemplateContents = Record<string, Record<string, string>>;

const extractTemplates = (node: ObjectLiteralExpression): TemplateContents => {
  const templates: TemplateContents = {};

  const components = listProperties(
    listProperties(node).components as ts.ObjectLiteralExpression,
  );

  Object.entries(components).forEach(([componentName, value]) => {
    templates[componentName] = {};

    let examples = {};

    try {
      examples = listProperties(
        listProperties(value as ts.ObjectLiteralExpression)
          .examples as ts.ObjectLiteralExpression,
      );
    } catch (_e) {}

    Object.entries(examples).forEach(([exampleName, value]) => {
      const template = listProperties(
        value as ts.ObjectLiteralExpression,
      ).template;

      templates[componentName][exampleName] = template.getText();
    });
  });

  return templates;
};

export const getTemplateContents = (filePath: string): TemplateContents => {
  // Load the file contents to the typescript ast
  const sourceFile = ts.createSourceFile(
    filePath,
    ts.sys.readFile(filePath) || "",
    ts.ScriptTarget.Latest,
    true,
  );

  let templates: TemplateContents = {};

  sourceFile.forEachChild((node) => {
    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declaration) => {
        if (
          declaration.name.getText() === "__docConfig" &&
          declaration.initializer &&
          ts.isObjectLiteralExpression(declaration.initializer)
        ) {
          templates = extractTemplates(declaration.initializer);
        }
      });
    }
  });

  return templates;
};

export const mergeTemplateInfo = (
  docInfo: DocConfig,
  templates: TemplateContents,
): ExtendedDocConfig => {
  Object.entries(docInfo.components).forEach(([componentName, value]) => {
    Object.entries(value.examples || {}).forEach(([exampleName, example]) => {
      const enrichedExample = example as EnrichedExample;
      enrichedExample.templateString =
        templates[componentName]?.[exampleName] ?? "";
    });
  });

  return docInfo as ExtendedDocConfig;
};

export const formatSnippet = (snippet: string) => {
  return prettier.format(snippet, {
    parser: "typescript",
  });
};
