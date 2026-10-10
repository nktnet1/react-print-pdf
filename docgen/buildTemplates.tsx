import { promises as fs } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import frontmatter from "front-matter";
import { glob } from "glob";
import { createElement } from "react";
import { bundleTemplate } from "#docgen/bundleTemplate";
import { docFrontmatter, mdxStringAttribute } from "#docgen/mdxSerialization";
import { renderPreview } from "#docgen/renderPreview";
import { formatTemplateSource } from "#docgen/templateSource";
import { formatCamelCaseToTitle } from "#docgen/utils";

export async function buildTemplates() {
  const templates = await glob(join(import.meta.dirname, "../src/ui/**/*.mdx"));

  return await Promise.all(
    templates.map(async (template) => {
      console.log("Building for template ", template);
      const docLocation = join(
        import.meta.dirname,
        "../docs/content/docs",
        relative(join(import.meta.dirname, "../src"), template),
      );
      const outPath = await bundleTemplate(template);

      const { default: Component } = await import(outPath);

      const RealComponent = Component.default ? Component.default : Component;

      const { attributes, body } = frontmatter<{
        title?: string;
        description?: string;
        icon?: string;
        category?: string;
      }>(
        await fs
          .readFile(template, {
            encoding: "utf-8",
          })
          .then((file) => file.toString()),
      );

      const paths = await renderPreview(
        createElement(RealComponent),
        `${dirname(
          relative(join(import.meta.dirname, "../src"), template),
        ).replace(/\//g, " ")} ${basename(outPath, ".mjs")}`,
        false,
      );

      const name =
        attributes.title || formatCamelCaseToTitle(basename(template, ".mdx"));
      const description =
        attributes.description ||
        `Example ${name} template built with React Print PDF.`;

      let markdown = docFrontmatter({
        title: name,
        description,
        icon: attributes.icon,
        category: attributes.category || "Uncategorized",
      });

      markdown += `<Frame background="subtle"><PreviewImage src="${paths.imagePath}" /></Frame>\n\n`;

      markdown += `\`\`\`jsx
${await formatTemplateSource(body)}
\`\`\`\n\n`;

      return {
        name,
        icon: attributes.icon,
        category: attributes.category,
        path: relative(join(import.meta.dirname, "../src"), template)
          .toLowerCase()
          .replace(/\.mdx$/, ""),
        image: paths.imagePath,
        outputPath: docLocation,
        markdown,
      };
    }),
  );
}

export const buildTemplateList = async (
  templates: Awaited<ReturnType<typeof buildTemplates>>,
) => {
  let markdown = `---
title: Browse
description: "Browse ready-to-use React Print PDF templates for reports, receipts, NDAs, and invoices."
icon: LayoutGridIcon
---\n\n`;

  // Group templates by category
  type Template = Awaited<ReturnType<typeof buildTemplates>>[number];
  const categories = templates.reduce<Record<string, Template[]>>(
    (acc, template) => {
      const category = template.category || "Uncategorized";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    },
    {},
  );

  // Generate markdown for each category
  Object.entries(categories).forEach(([category, templates]) => {
    markdown += `## ${category}\n\n<CardGroup>\n`;

    templates.forEach((template) => {
      markdown += ` <Card ${mdxStringAttribute("title", template.name)} ${mdxStringAttribute("href", `/docs/${template.path}`)}>
      <div style={{ marginTop: "1rem", borderRadius: "0.25rem", overflow: "hidden" }}>
        <PreviewImage ${mdxStringAttribute("src", template.image)}/>
      </div>
    </Card>\n`;
    });

    markdown += `</CardGroup>\n\n`;
  });

  return markdown;
};

/** Sidebar metadata for the generated template pages. */
export const buildTemplateMetadata = (
  templates: Awaited<ReturnType<typeof buildTemplates>>,
  templatesRoot: string,
) => {
  const categories = templates.reduce<Record<string, string[]>>(
    (acc, template) => {
      const category = template.category || "Uncategorized";
      acc[category] ??= [];
      const page = relative(templatesRoot, template.outputPath)
        .split(sep)
        .join("/")
        .replace(/\.mdx$/, "");
      // Fumadocs meta.json uses a ./ prefix for paths in nested directories.
      acc[category].push(page.includes("/") ? `./${page}` : page);
      return acc;
    },
    {},
  );
  const pages = Object.entries(categories).flatMap(([category, entries]) => [
    `---${category}---`,
    ...entries,
  ]);

  return { title: "Examples", pages };
};
