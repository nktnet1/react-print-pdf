import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { createElement, Fragment, type ReactElement } from "react";
import type { CompileOptions } from "#/compile/compile";
import {
  ensurePreviewImage,
  isNonEmptyFile,
  previewContentHash,
} from "#docgen/previewAssets";

type CompileModule = Pick<typeof import("#/compile/compile"), "compile">;

const loadCompileModule = async (): Promise<CompileModule> => {
  const distEntry = pathToFileURL(
    path.join(import.meta.dirname, "../dist/index.js"),
  ).href;

  return (await import(distEntry)) as CompileModule;
};

export const baseCss = fs.readFileSync(
  path.join(import.meta.dirname, "./base.css"),
);
const indexCss = fs.readFileSync(
  path.join(import.meta.dirname, "../dist/index.css"),
);

export async function renderPreview(
  component: ReactElement,
  componentName: string,
  useBaseCss: boolean = true,
  compileOptions?: CompileOptions,
) {
  const element = createElement(Fragment, null, component);
  const { compile } = await loadCompileModule();
  const documentCss = useBaseCss ? baseCss.toString() : "@page { size: A4; }";

  const html = `<!doctype html><html><head>
          <meta charset="utf-8" />
          <style>${documentCss}</style>
          <style>${indexCss.toString()}</style>
          </head><body>${await compile(element, compileOptions)}</body></html>`;

  let id = previewContentHash(html);
  id = `${componentName.replace(/ /g, "-").toLowerCase()}-${id.slice(0, 8)}`;

  const targetFolder = path.join(
    import.meta.dirname,
    `../docs/public/docs/images/previews/${id}/`,
  );

  const pdfPath = path.join(targetFolder, "document.pdf");

  // A previous run might have left the directory behind without a valid PDF.
  if (!isNonEmptyFile(pdfPath)) {
    fs.mkdirSync(targetFolder, { recursive: true });
    fs.writeFileSync(path.join(targetFolder, "index.html"), html);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.pdf({
        path: pdfPath,
        format: "A4",
        preferCSSPageSize: true,
        printBackground: true,
      });
    } finally {
      await browser.close();
    }
  }

  // A failed rasterization must not be mistaken for the end of a document.
  // Only the first page is used as the documentation preview image.
  const previewImage = ensurePreviewImage(targetFolder);
  const publicDocsPath = path.join(import.meta.dirname, "../docs/public/docs");
  const toPublicUrl = (assetPath: string) =>
    `/docs/${path
      .relative(publicDocsPath, assetPath)
      .split(path.sep)
      .join("/")}`;

  return {
    imagePath: toPublicUrl(previewImage),
    pdfPath: toPublicUrl(pdfPath),
  };
}
