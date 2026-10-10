import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import { describe, expect, test } from "vitest";
import { __docConfig as compileDocs } from "#/compile/compile";
import { __docConfig as cssDocs } from "#/css/css";
import type { DocConfig } from "#/docgen/types";
import { __docConfig as footnoteDocs } from "#/footnote/footnote";
import { __docConfig as latexDocs } from "#/latex/latex";
import { __docConfig as markdownDocs } from "#/markdown/markdown";
import { __docConfig as shellDocs } from "#/shell/shell";
import { __docConfig as signatureDocs } from "#/signature/signature";
import { __docConfig as tailwindDocs } from "#/tailwind/tailwind";
import { __docConfig as variablesDocs } from "#/variables/variables";
import { formatExampleSource } from "../../docgen/exampleSource";
import { getTemplateContents, mergeTemplateInfo } from "../../docgen/utils";

const sources: { filename: string; config: DocConfig }[] = [
  { filename: "compile/compile.tsx", config: compileDocs },
  { filename: "css/css.tsx", config: cssDocs },
  { filename: "footnote/footnote.tsx", config: footnoteDocs },
  { filename: "latex/latex.tsx", config: latexDocs },
  { filename: "markdown/markdown.tsx", config: markdownDocs },
  { filename: "shell/shell.tsx", config: shellDocs },
  { filename: "signature/signature.tsx", config: signatureDocs },
  { filename: "tailwind/tailwind.tsx", config: tailwindDocs },
  { filename: "variables/variables.tsx", config: variablesDocs },
];

const resolveSource = (relativePath: string) =>
  fileURLToPath(new URL(`../../src/${relativePath}`, import.meta.url));
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

// Read the maintained public entrypoint rather than duplicating its API in
// a test constant: a newly added component must also be imported in examples.
const clientSource = ts.createSourceFile(
  "client.ts",
  readFileSync(resolveSource("client.ts"), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const publicNames = new Set<string>();
for (const statement of clientSource.statements) {
  if (
    ts.isExportDeclaration(statement) &&
    statement.exportClause &&
    ts.isNamedExports(statement.exportClause)
  ) {
    for (const element of statement.exportClause.elements) {
      publicNames.add(element.name.text);
    }
  }
}

const isReference = (identifier: ts.Identifier): boolean => {
  const parent = identifier.parent;
  return !(
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    (ts.isPropertyAssignment(parent) && parent.name === identifier) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === identifier) ||
    (ts.isJsxAttribute(parent) && parent.name === identifier) ||
    (ts.isVariableDeclaration(parent) && parent.name === identifier)
  );
};

describe("copyable documentation component examples", () => {
  test("the compile guide references the component generated alongside it", () => {
    for (const example of Object.values(
      compileDocs.components.compile.examples ?? {},
    )) {
      expect(example.description).toContain("compile(<Document />");
      expect(example.description).not.toContain("<Component />");
    }
  });

  test("all maintained examples produce valid TSX with every referenced public import", async () => {
    let examples = 0;
    const virtualSources = new Map<string, string>();
    for (const { filename, config } of sources) {
      const doc = mergeTemplateInfo(
        config,
        getTemplateContents(resolveSource(filename)),
      );
      for (const [component, info] of Object.entries(doc.components)) {
        for (const [name, example] of Object.entries(info.examples ?? {})) {
          examples++;
          const label = `${filename} ${component}.${name}`;
          const source = await formatExampleSource(example, component);
          // Typecheck the copyable snippets as independent modules. These
          // paths are virtual: the test does not write generated documents.
          virtualSources.set(
            join(
              projectRoot,
              "tests/docgen/__examples__",
              `${filename.replaceAll("/", "-").replace(".tsx", "")}-${component}-${name}.tsx`,
            ),
            source,
          );
          const ast = ts.createSourceFile(
            "template.tsx",
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
          );
          const transpiled = ts.transpileModule(source, {
            fileName: "template.tsx",
            reportDiagnostics: true,
            compilerOptions: { jsx: ts.JsxEmit.React },
          });
          expect(transpiled.diagnostics ?? [], label).toHaveLength(0);
          expect(source, label).toContain('import React from "react";');
          expect(source, label).toContain("export const Document = () =>");

          const imported = new Set<string>();
          for (const statement of ast.statements) {
            if (
              ts.isImportDeclaration(statement) &&
              statement.moduleSpecifier.getText(ast) === '"react-print-pdf"' &&
              statement.importClause?.namedBindings &&
              ts.isNamedImports(statement.importClause.namedBindings)
            ) {
              for (const element of statement.importClause.namedBindings
                .elements) {
                imported.add(element.name.text);
              }
            }
          }

          const referenced = new Set<string>();
          const visit = (node: ts.Node) => {
            if (
              ts.isIdentifier(node) &&
              publicNames.has(node.text) &&
              isReference(node)
            ) {
              referenced.add(node.text);
            }
            ts.forEachChild(node, visit);
          };
          // Only scan the component declaration; imports themselves are not
          // references that could reveal a missing import.
          for (const statement of ast.statements) {
            if (!ts.isImportDeclaration(statement)) visit(statement);
          }
          expect(
            [...referenced].filter((name) => !imported.has(name)),
            `${label}: the generated example references public exports without importing them`,
          ).toEqual([]);
        }
      }
    }
    expect(examples).toBeGreaterThan(20);

    // Parsing TSX cannot detect missing type-only imports, invalid props or
    // type mismatches in the generated examples. Resolve the real source API
    // without depending on a previously built dist/ package.
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.React,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: projectRoot,
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

  test("preserves external imports and deduplicates explicitly listed components", async () => {
    const source = await formatExampleSource(
      {
        templateString: "<Tailwind><Button>Ready</Button></Tailwind>",
        imports: ["Tailwind", "Tailwind"],
        externalImports: ['import { Button } from "@chakra-ui/react";'],
      },
      "Tailwind",
    );

    expect(source).toContain('import { Tailwind } from "react-print-pdf";');
    expect(source).toContain('import { Button } from "@chakra-ui/react";');
    expect(source).toContain("export const Document = () => (");
  });
});
