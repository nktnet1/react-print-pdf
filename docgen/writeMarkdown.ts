import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Write a generated MDX page, creating its parent directories, not the file path. */
export const writeGeneratedMarkdown = (
  outputPath: string,
  markdown: string,
) => {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);
};
