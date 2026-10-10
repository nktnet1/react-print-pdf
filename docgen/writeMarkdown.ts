import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

/** Write a generated MDX page, creating its parent directories, not the file path. */
export const writeGeneratedMarkdown = (
  outputPath: string,
  markdown: string,
) => {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, markdown);
};

/** Replace generated template pages so removed sources cannot leave stale MDX. */
export const replaceGeneratedTemplatePages = (
  directory: string,
  pages: readonly { outputPath: string; markdown: string }[],
) => {
  const root = resolve(directory);
  // Validate every destination before removing existing output.
  for (const page of pages) {
    const destination = resolve(page.outputPath);
    if (
      !destination.startsWith(`${root}${sep}`) ||
      destination === join(root, "index.mdx")
    ) {
      throw new Error(
        `Template output is outside ${directory}: ${page.outputPath}`,
      );
    }
  }

  // The UI index and sidebar metadata are maintained separately. Remove only
  // generated MDX pages, including ones whose source has since been deleted.
  const prune = (folder: string) => {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = join(folder, entry.name);
      if (entry.isDirectory()) prune(filename);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".mdx") &&
        filename !== join(root, "index.mdx")
      )
        rmSync(filename);
    }
  };
  prune(root);
  mkdirSync(root, { recursive: true });
  for (const page of pages) {
    writeGeneratedMarkdown(page.outputPath, page.markdown);
  }
};
