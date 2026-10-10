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
  const templatesRoot = join(root, "templates");
  // Validate every destination before removing existing output.
  for (const page of pages) {
    const destination = resolve(page.outputPath);
    if (!destination.startsWith(`${templatesRoot}${sep}`)) {
      throw new Error(
        `Template output is outside ${directory}: ${page.outputPath}`,
      );
    }
  }

  // Only the templates subtree is generated here. Sibling UI pages (including
  // hand-authored guides and the landing page) must never be pruned.
  const prune = (folder: string) => {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const filename = join(folder, entry.name);
      if (entry.isDirectory()) prune(filename);
      else if (entry.isFile() && entry.name.endsWith(".mdx")) rmSync(filename);
    }
  };
  prune(templatesRoot);
  mkdirSync(templatesRoot, { recursive: true });
  for (const page of pages) {
    writeGeneratedMarkdown(page.outputPath, page.markdown);
  }
};
