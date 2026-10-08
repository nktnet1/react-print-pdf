import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { fromBuffer } from "pdf2pic";
import { chromium } from "playwright";
import type React from "react";
import type { CompileOptions } from "#/compile/compile";

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
  component: React.ReactElement,
  componentName: string,
  useBaseCss: boolean = true,
  compileOptions?: CompileOptions,
) {
  const Component = component;
  const Element = <>{Component}</>;
  const { compile } = await loadCompileModule();
  const documentCss = useBaseCss ? baseCss.toString() : "@page { size: A4; }";

  const html = `<!doctype html><html><head>
          <meta charset="utf-8" />
          <style>${documentCss}</style>
          <style>${indexCss.toString()}</style>
          </head><body>${await compile(Element, compileOptions)}</body></html>`;

  const hash = crypto.createHash("sha256");
  hash.update(html);

  let id = hash.digest("hex");
  id = `${componentName.replace(/ /g, "-").toLowerCase()}-${id.slice(0, 8)}`;

  const targetFolder = path.join(
    import.meta.dirname,
    `../docs/public/docs/images/previews/${id}/`,
  );

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });

    const htmlPath = path.join(targetFolder, "index.html");
    const pdfPath = path.join(targetFolder, "document.pdf");

    fs.writeFileSync(htmlPath, html);

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

    const buffer = fs.readFileSync(pdfPath);

    const pdf2pic = fromBuffer(buffer, {
      density: 300,
      saveFilename: "document",
      savePath: targetFolder,
      format: "jpg",
      preserveAspectRatio: true,
      width: 1920,
    });

    let currentPage = 1;

    while (true) {
      try {
        await pdf2pic(currentPage);
      } catch (_e) {
        break;
      }

      currentPage++;
    }
  }

  const pages = (await glob(path.join(targetFolder, "*.jpg"))).sort();
  const pdf = await glob(path.join(targetFolder, "*.pdf"));
  const publicDocsPath = path.join(import.meta.dirname, "../docs/public/docs");
  const toPublicUrl = (assetPath: string) =>
    `/docs/${path
      .relative(publicDocsPath, assetPath)
      .split(path.sep)
      .join("/")}`;

  const imagePath = toPublicUrl(pages[0]);
  const pdfPath = toPublicUrl(pdf[0]);

  return {
    imagePath,
    pdfPath,
  };
}
