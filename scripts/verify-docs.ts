import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { styleText } from "node:util";

const contentRoot = "docs/content/docs";
const generatedPaths = [
  `${contentRoot}/components`,
  `${contentRoot}/ui/templates`,
  `${contentRoot}/ui/index.mdx`,
  `${contentRoot}/index.mdx`,
];
const oldPackage = /@fileforge\/react-print(?:\/[\w.-]+)?/g;
const previewUrl = /\/docs\/images\/previews\/[\w./%-]+/g;

export type DocsVerification = {
  pages: number;
  previews: number;
  changedFiles: number;
  issues: string[];
};

const mdxFiles = (folder: string): string[] => {
  if (!existsSync(folder)) return [];
  const files: string[] = [];
  const directories = [folder];
  while (directories.length > 0) {
    const directory = directories.pop();
    if (!directory) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) directories.push(entryPath);
      else if (entry.isFile() && entry.name.endsWith(".mdx"))
        files.push(entryPath);
    }
  }
  return files.sort();
};

const nonEmptyFile = (filePath: string) =>
  existsSync(filePath) &&
  statSync(filePath).isFile() &&
  statSync(filePath).size > 0;

/** Only generated MDX/metadata are compared; PDF/JPEG bytes are not deterministic. */
export const changedGeneratedDocs = (root: string): string[] => {
  const output = execFileSync(
    "git",
    [
      "-C",
      root,
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
      "--",
      ...generatedPaths,
    ],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
};

/** Verify regenerated docs before comparing them with the committed MDX. */
export const verifyGeneratedDocs = (
  root: string,
  { freshness = false }: { freshness?: boolean } = {},
): DocsVerification => {
  const issues: string[] = [];
  const docsRoot = join(root, contentRoot);
  const componentPages = mdxFiles(join(docsRoot, "components"));
  const templatePages = mdxFiles(join(docsRoot, "ui/templates"));
  if (componentPages.length === 0)
    issues.push("No generated component pages were found");
  if (templatePages.length === 0)
    issues.push("No generated template pages were found");
  for (const filename of ["index.mdx", "ui/index.mdx"]) {
    if (!existsSync(join(docsRoot, filename)))
      issues.push(`Missing generated landing page: ${contentRoot}/${filename}`);
  }

  const publicRoot = resolve(root, "docs/public");
  const previewsRoot = resolve(publicRoot, "docs/images/previews");
  const checkedAssets = new Set<string>();
  let previews = 0;
  const pages = mdxFiles(docsRoot);

  for (const file of pages) {
    const page = relative(root, file);
    const markdown = readFileSync(file, "utf8");
    if (oldPackage.test(markdown))
      issues.push(`${page}: obsolete @fileforge/react-print reference`);
    oldPackage.lastIndex = 0;

    for (const match of markdown.matchAll(previewUrl)) {
      previews++;
      const url = match[0];
      let decoded: string;
      try {
        decoded = decodeURIComponent(url);
      } catch {
        issues.push(`${page}: invalid preview URL encoding: ${url}`);
        continue;
      }
      const parts = decoded.slice(1).split("/");
      const asset = resolve(publicRoot, ...parts);
      if (
        parts.some((part) => part === "." || part === "..") ||
        !asset.startsWith(`${previewsRoot}${sep}`)
      ) {
        issues.push(
          `${page}: preview URL escapes the preview directory: ${url}`,
        );
        continue;
      }
      if (checkedAssets.has(asset)) continue;
      checkedAssets.add(asset);
      if (!nonEmptyFile(asset)) {
        issues.push(`${page}: missing or empty preview: ${url}`);
      }
      if (/\.(?:jpe?g|png|webp)$/i.test(asset)) {
        const pdf = join(dirname(asset), "document.pdf");
        if (!nonEmptyFile(pdf))
          issues.push(
            `${page}: missing or empty preview PDF: ${relative(root, pdf)}`,
          );
      }
    }
  }

  let changedFiles = 0;
  if (freshness) {
    try {
      const changed = changedGeneratedDocs(root);
      changedFiles = changed.length;
      for (const file of changed) {
        issues.push(`Generated docs differ from HEAD: ${file}`);
      }
    } catch (error) {
      issues.push(
        `Could not compare generated docs with Git HEAD: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { pages: pages.length, previews, changedFiles, issues };
};

const run = () => {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--freshness")) {
    console.error("Usage: tsx scripts/verify-docs.ts [--freshness]");
    process.exitCode = 2;
    return;
  }
  const report = verifyGeneratedDocs(process.cwd(), {
    freshness: args.includes("--freshness"),
  });
  const summary = `${report.pages} MDX pages, ${report.previews} preview references, ${report.changedFiles} changed generated files`;
  if (report.issues.length > 0) {
    console.error(
      `${styleText("red", "FAIL")} documentation verification (${summary})`,
    );
    for (const issue of report.issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `${styleText("green", "PASS")} documentation verification (${summary})`,
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  run();
