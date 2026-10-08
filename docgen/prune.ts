// List all the folder paths contained in the docs/images/previews directory
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { glob } from "glob";

const dir = "docs/public/docs/images/previews";
const folders = readdirSync(dir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name);

// List all the mdx files contained in the docs directory

const mdxFiles = glob.sync("docs/content/docs/**/*.mdx");

let unusedPreviews = folders;

// For each mdx file, check if it contains a preview image
mdxFiles.forEach((file) => {
  const content = readFileSync(file, "utf-8");

  unusedPreviews = unusedPreviews.filter(
    (preview) => !content.includes(preview),
  );
});

// Remove the previews that are still in the unusued
unusedPreviews.forEach((preview) => {
  const path = `${dir}/${preview}`;
  rmSync(path, { recursive: true });
});
