import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "@typescript/typescript6";
import { expect, test } from "vitest";
import { getTemplateContents } from "../../docgen/utils";

test("docgen extracts JSX examples using the TypeScript compiler API", () => {
  const filePath = fileURLToPath(
    new URL("../../src/compile/compile.tsx", import.meta.url),
  );
  const templates = getTemplateContents(filePath);

  expect(templates.compile.default).toContain("<Tailwind>");
  expect(templates.compile.emotion).toContain("<ChakraProvider");
});

test("react-docgen-typescript parses annotated React props with the TypeScript 6 API", () => {
  const filePath = fileURLToPath(
    new URL("../fixtures/docgen/typed-props.tsx", import.meta.url),
  );
  const parser = fileURLToPath(
    new URL("../fixtures/docgen/parse.cjs", import.meta.url),
  );
  const preload = fileURLToPath(
    new URL("../../scripts/register-docgen-typescript.mjs", import.meta.url),
  );
  const docs: unknown = JSON.parse(
    execFileSync(process.execPath, ["--import", preload, parser, filePath], {
      encoding: "utf8",
    }),
  );

  expect(docs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        displayName: "DocgenFixture",
        props: expect.objectContaining({
          message: expect.objectContaining({ required: true }),
        }),
      }),
    ]),
  );
}, 30_000);

// The Node/tsx documentation runner can lower TSX with the classic JSX
// transform. This must never produce calls to an undeclared React global.
test("docgen preview entrypoints do not require an implicit React JSX global", () => {
  for (const file of ["renderPreview.tsx", "buildTemplates.tsx"]) {
    const filename = fileURLToPath(
      new URL(`../../docgen/${file}`, import.meta.url),
    );
    const output = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ESNext,
      },
    }).outputText;

    expect(output).not.toMatch(/\bReact\.createElement\s*\(/);
  }
});
