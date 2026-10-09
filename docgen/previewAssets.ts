import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const isNonEmptyFile = (filePath: string): boolean => {
  if (!existsSync(filePath)) return false;
  const stats = statSync(filePath);
  return stats.isFile() && stats.size > 0;
};

type RasterizeCommand = (
  command: string,
  args: string[],
  options: { timeout: number; stdio: ["ignore", "pipe", "pipe"] },
) => unknown;

export const rasterizeFirstPage = (
  pdfPath: string,
  outputPrefix: string,
  execute: RasterizeCommand = execFileSync,
): void => {
  try {
    execute(
      "pdftoppm",
      [
        "-f",
        "1",
        "-l",
        "1",
        "-singlefile",
        "-jpeg",
        "-r",
        "300",
        "-scale-to-x",
        "1920",
        "-scale-to-y",
        "-1",
        pdfPath,
        outputPrefix,
      ],
      // execFileSync forwards stderr by default, including Poppler's harmless
      // Type 3 glyph warnings. Capture it instead and report it on failure.
      { timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr ?? "").trim()
        : "";
    throw new Error(
      `pdftoppm failed: ${stderr || (error instanceof Error ? error.message : String(error))}`,
      { cause: error },
    );
  }
};

/** Resolve the first preview page, regenerating it after an interrupted build. */
export const ensurePreviewImage = (
  folder: string,
  rasterize: (
    pdfPath: string,
    outputPrefix: string,
  ) => void = rasterizeFirstPage,
): string => {
  const pdfPath = join(folder, "document.pdf");
  if (!isNonEmptyFile(pdfPath)) {
    throw new Error(
      `Cannot create preview: missing or empty PDF at ${pdfPath}`,
    );
  }

  // Keep the image produced by the previous pdf2pic implementation if present.
  const legacyImage = join(folder, "document.1.jpg");
  const imagePath = join(folder, "document.jpg");
  if (isNonEmptyFile(legacyImage)) return legacyImage;
  if (isNonEmptyFile(imagePath)) return imagePath;

  try {
    rasterize(pdfPath, join(folder, "document"));
  } catch (error) {
    throw new Error(
      `Failed to generate JPEG preview from ${pdfPath}. Ensure Poppler (pdftoppm) is installed and the PDF is valid.`,
      { cause: error },
    );
  }

  if (!isNonEmptyFile(imagePath)) {
    throw new Error(
      `PDF rasterization completed without creating a JPEG preview at ${imagePath}`,
    );
  }
  return imagePath;
};
