import frontmatter from "front-matter";
import { promises as fs } from "fs";
import { glob } from "glob";
import { basename, dirname, join, relative } from "path";
import remarkFrontmatter from "remark-frontmatter";
import type { TsdownPlugin } from "tsdown";
import { renderPreview } from "./renderPreview";
import { formatCamelCaseToTitle, formatSnippet } from "./utils";

const tmpDir = join(__dirname, "../.tmp");

export async function buildTemplates() {
  const [{ default: mdx }, { build }, { default: Raw }] = await Promise.all([
    import("@mdx-js/rollup"),
    import("tsdown"),
    import("unplugin-raw/rolldown"),
  ]);

  const templates = await glob(join(__dirname, "../src/ui/**/*.mdx"));

  return await Promise.all(
    templates.map(async (template) => {
      console.log("Building for template ", template);
      const outPath = `${join(
        tmpDir,
        dirname(relative(join(__dirname, "../src"), template)),
        basename(template, ".mdx"),
      )}.mjs`;

      const docLocation = join(
        __dirname,
        `../docs/content/docs/${dirname(
          relative(join(__dirname, "../src"), template),
        )}/${basename(template)}`,
      );

      await build({
        entry: [template],
        plugins: [
          mdx({
            remarkPlugins: [remarkFrontmatter],
            providerImportSource: "@fileforge/react-print/mdx",
          }) as unknown as TsdownPlugin,
          Raw(),
        ],
        dts: false,
        outDir: dirname(outPath),
        format: "esm",
        platform: "node",
        sourcemap: false,
        config: false,
        clean: false,
      });

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
        <RealComponent />,
        `${dirname(relative(join(__dirname, "../src"), template)).replace(
          /\//g,
          " ",
        )} ${basename(outPath, ".mjs")}`,
        false,
      );

      const name =
        attributes.title || formatCamelCaseToTitle(basename(template, ".mdx"));
      const description =
        attributes.description ||
        `Example ${name} template built with React Print.`;

      let markdown = `---
title: ${name}
description: ${JSON.stringify(description)}
${attributes.icon ? `icon: ${attributes.icon}` : ""}
category: ${attributes.category || "Uncategorized"}
---\n\n`;

      markdown += `<Frame background="subtle"><PreviewImage src="${paths.imagePath}" /></Frame>\n\n`;

      markdown += `\`\`\`jsx
${await formatSnippet(body)}
\`\`\`\n\n`;

      return {
        name,
        icon: attributes.icon,
        category: attributes.category,
        path: relative(join(__dirname, "../src"), template)
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
description: "Browse ready-to-use React Print templates for reports, receipts, NDAs, and invoices."
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
      markdown += ` <Card title="${template.name}" href="/docs/${template.path}">
      <div style={{ marginTop: "1rem", borderRadius: "0.25rem", overflow: "hidden" }}>
        <PreviewImage src="${template.image}"/>
      </div>
    </Card>\n`;
    });

    markdown += `</CardGroup>\n\n`;
  });

  return markdown;
};
