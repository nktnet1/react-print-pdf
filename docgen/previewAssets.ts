import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** Stable cache identity for a compiled document, ignoring Tailwind nonce IDs. */
export const previewContentHash = (html: string): string => {
  const ids = new Map<string, string>();
  for (const match of html.matchAll(
    /\breact-print-tailwind-[a-f0-9]{32}-\d+\b/g,
  )) {
    if (!ids.has(match[0])) {
      ids.set(match[0], `react-print-tailwind-cache-${ids.size}`);
    }
  }

  // Each compile() call uses random Tailwind boundaries to avoid cross-document
  // CSS collisions. Replacing only the boundary attributes isn't enough:
  // scoped @keyframes and @font-face names also contain the hex-encoded ID.
  let stableHtml = html;
  for (const [id, stableId] of ids) {
    const encodedId = Buffer.from(id).toString("hex");
    const encodedStableId = Buffer.from(stableId).toString("hex");
    stableHtml = stableHtml.replaceAll(
      `react-print-${encodedId}-`,
      `react-print-${encodedStableId}-`,
    );
  }
  // Replace complete identifiers in one pass. Sequential string replacement
  // could mistake the end of region 10 for the shorter region 1 identifier.
  stableHtml = stableHtml.replace(
    /\breact-print-tailwind-[a-f0-9]{32}-\d+\b/g,
    (id) => ids.get(id) ?? id,
  );

  return createHash("sha256").update(stableHtml).digest("hex");
};

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
