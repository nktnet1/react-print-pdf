import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { pathToFileURL } from "node:url";
import { FileforgeClient } from "@fileforge/client";
import { config } from "dotenv";
import { glob } from "glob";
import { fromBuffer } from "pdf2pic";
import type React from "react";
import type { CompileOptions } from "#/compile/compile";

config({ path: ".env.local" });
config();

type CompileModule = Pick<typeof import("#/compile/compile"), "compile">;

const loadCompileModule = async (): Promise<CompileModule> => {
  const distEntry = pathToFileURL(
    path.join(import.meta.dirname, "../dist/index.js"),
  ).href;

  return (await import(distEntry)) as CompileModule;
};

const getFileforgeClient = () => {
  const apiKey = process.env.FILEFORGE_API_KEY ?? process.env.ONEDOC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FILEFORGE_API_KEY (or legacy ONEDOC_API_KEY) is required to generate documentation previews.",
    );
  }

  return new FileforgeClient({ apiKey });
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

  const html = `<!doctype html><html><head>
          <link rel="stylesheet" href="base.css" />
          <link rel="stylesheet" href="index.css" />
          </head><body>${await compile(Element, compileOptions)}</body></html>`;

  const hash = crypto.createHash("sha256");
  hash.update(html);

  let id = hash.digest("hex");
  id = `${componentName.replace(/ /g, "-").toLowerCase()}-${id.slice(0, 8)}`;

  const targetFolder = path.join(
    import.meta.dirname,
    `../docs/public/docs/images/previews/${id}/`,
  );

  // If the file doesn't exist, create it by generating the document with Fileforge.
  if (!fs.existsSync(targetFolder)) {
    const ff = getFileforgeClient();
    const file = await ff.pdf.generate(
      [
        new File([html], "index.html", { type: "text/html" }),
        useBaseCss
          ? new File([baseCss], "base.css", { type: "text/css" })
          : new File([`@page { size: A4; }`], "base.css", { type: "text/css" }),
        new File([indexCss], "index.css", { type: "text/css" }),
      ],
      {
        options: {
          host: false,
          test: false,
        },
      },
    );

    // Create the directory
    fs.mkdirSync(targetFolder, { recursive: true });

    // Write the HTML to a file
    fs.writeFileSync(path.join(targetFolder, "index.html"), html);

    await pipeline(
      file,
      fs.createWriteStream(path.join(targetFolder, "document.pdf")),
    );

    const buffer = fs.readFileSync(path.join(targetFolder, "document.pdf"));

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
