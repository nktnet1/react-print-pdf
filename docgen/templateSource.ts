import ts from "@typescript/typescript6";
import { formatSnippet } from "#docgen/utils";

/** Turn a maintained MDX template's JSX expression into a runnable JSX module. */
export const formatTemplateSource = async (body: string): Promise<string> => {
  const ast = ts.createSourceFile(
    "template.jsx",
    body,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JSX,
  );

  const syntaxCheck = ts.transpileModule(body, {
    fileName: "template.jsx",
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext },
  });
  if (
    syntaxCheck.diagnostics?.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    )
  ) {
    throw new Error("Template contains invalid JSX source.");
  }

  const markup = ast.statements.at(-1);
  if (
    !markup ||
    !ts.isExpressionStatement(markup) ||
    !(
      ts.isJsxElement(markup.expression) ||
      ts.isJsxFragment(markup.expression) ||
      ts.isJsxSelfClosingElement(markup.expression)
    ) ||
    ast.statements.some(
      (statement) =>
        statement !== markup && ts.isExpressionStatement(statement),
    )
  ) {
    throw new Error("Template must end with a single top-level JSX element.");
  }

  const importsReact = ast.statements.some((statement) => {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "react"
    ) {
      return false;
    }
    const clause = statement.importClause;
    return (
      clause?.name?.text === "React" ||
      (clause?.namedBindings &&
        ts.isNamespaceImport(clause.namedBindings) &&
        clause.namedBindings.name.text === "React")
    );
  });

  const precedingSource = body.slice(0, markup.getStart(ast));
  const jsx = markup.expression.getText(ast);
  return formatSnippet(`${importsReact ? "" : 'import React from "react";\n'}${precedingSource}
export const Document = () => (
${jsx}
);
`);
};
