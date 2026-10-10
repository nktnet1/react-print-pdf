import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import frontmatter from "front-matter";
import { expect, test } from "vitest";
import { formatTemplateSource } from "../../docgen/templateSource";

const templateRoot = fileURLToPath(
  new URL("../../src/ui/templates/", import.meta.url),
);

for (const name of readdirSync(templateRoot)
  .filter((file) => file.endsWith(".mdx"))
  .sort()) {
  test(`${name} produces a runnable JSX Document`, async () => {
    const body = frontmatter(
      readFileSync(join(templateRoot, name), "utf8"),
    ).body;
    const source = await formatTemplateSource(body);
    const ast = ts.createSourceFile(
      `${name}.jsx`,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JSX,
    );
    expect(source.match(/import React(?:,| from) /g)).toHaveLength(1);

    const document = ast.statements.find(
      (statement) =>
        ts.isVariableStatement(statement) &&
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ) &&
        statement.declarationList.declarations.some((declaration) => {
          if (
            !ts.isIdentifier(declaration.name) ||
            declaration.name.text !== "Document" ||
            !declaration.initializer ||
            !ts.isArrowFunction(declaration.initializer)
          ) {
            return false;
          }
          let body = declaration.initializer.body;
          while (ts.isParenthesizedExpression(body)) body = body.expression;
          return (
            ts.isJsxElement(body) ||
            ts.isJsxFragment(body) ||
            ts.isJsxSelfClosingElement(body)
          );
        }),
    );
    expect(document, `${name} exports a JSX Document`).toBeDefined();
    // The source must not leave behind an orphaned top-level JSX expression.
    expect(ast.statements.filter(ts.isExpressionStatement)).toHaveLength(0);

    const compiled = ts.transpileModule(source, {
      fileName: `${name}.jsx`,
      reportDiagnostics: true,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    });
    expect(compiled.diagnostics ?? [], name).toHaveLength(0);
    expect(compiled.outputText).toContain("React.createElement(");
    expect(compiled.outputText).toContain("export const Document");
  });
}

test("existing React imports are not duplicated and helper exports are retained", async () => {
  const source = await formatTemplateSource(`
import React from "react";
export const total = 42;
<main>{total}</main>;
`);
  expect(source.match(/import React from "react"/g)).toHaveLength(1);
  expect(source).toContain("export const total = 42;");
  expect(source).toContain("export const Document = () =>");

  const namespace = await formatTemplateSource(`
import * as React from "react";
<React.Fragment><p>Hi</p></React.Fragment>;
`);
  expect(namespace).not.toContain('import React from "react"');
});

test("malformed templates and multiple top-level expressions fail explicitly", async () => {
  await expect(formatTemplateSource("<main><p></main>")).rejects.toThrow(
    "invalid JSX",
  );
  await expect(formatTemplateSource("const answer = 42;")).rejects.toThrow(
    "single top-level JSX element",
  );
  await expect(
    formatTemplateSource("<p>First</p>; <p>Second</p>;"),
  ).rejects.toThrow("single top-level JSX element");
});

test("copyable JSX templates accept the published component props", async () => {
  const virtualSources = new Map<string, string>();
  for (const name of readdirSync(templateRoot).filter((file) =>
    file.endsWith(".mdx"),
  )) {
    const body = frontmatter(
      readFileSync(join(templateRoot, name), "utf8"),
    ).body;
    const file = join(templateRoot, "__copyable__", `${name}.jsx`);
    virtualSources.set(file, await formatTemplateSource(body));
  }

  // These are deliberately JSX examples, not TSX: ordinary JS callbacks are
  // unannotated, but TypeScript should still reject invalid public props.
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.React,
    allowJs: true,
    checkJs: true,
    strict: true,
    noImplicitAny: false,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: join(templateRoot, "../../.."),
    paths: {
      "#/*": ["src/*"],
      "#config/*": ["config/*.ts"],
      "react-print-pdf": ["src/index.ts"],
    },
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (file) => virtualSources.get(file) ?? readFile(file);
  host.fileExists = (file) => virtualSources.has(file) || fileExists(file);

  const program = ts.createProgram([...virtualSources.keys()], options, host);
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) =>
      diagnostic.file ? virtualSources.has(diagnostic.file.fileName) : false,
    );
  expect(
    errors.map((error) => {
      const position = error.file?.getLineAndCharacterOfPosition(
        error.start ?? 0,
      );
      return `${error.file?.fileName}:${(position?.line ?? 0) + 1}: TS${error.code} ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`;
    }),
  ).toEqual([]);
}, 30_000);
