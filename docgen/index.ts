import * as fs from "node:fs";
import * as path from "node:path";
import * as glob from "glob";
import * as docgen from "react-docgen-typescript";
import { buildFileMarkdown } from "#docgen/buildFileMarkdown";
import {
  buildTemplateList,
  buildTemplateMetadata,
  buildTemplates,
} from "#docgen/buildTemplates";
import { buildDocgenComponent } from "#docgen/bundling";
import { formatGeneratedMetadata } from "#docgen/generatedMetadata";
import { mdxStringAttribute } from "#docgen/mdxSerialization";
import { replaceInFile } from "#docgen/pageBuilder/buildIntroduction";
import type { DocConfig, LucideIconName } from "#docgen/types";
import {
  formatCamelCaseToTitle,
  getTemplateContents,
  mergeTemplateInfo,
} from "#docgen/utils";
import {
  replaceGeneratedTemplatePages,
  writeGeneratedMarkdown,
} from "#docgen/writeMarkdown";

const tmpDir = path.join(import.meta.dirname, "../.tmp");
const docsPath = path.join(
  import.meta.dirname,
  "../docs/content/docs/components",
);

const options: docgen.ParserOptions = {
  savePropValueAsString: true,
  propFilter: {
    skipPropsWithoutDoc: true,
  },
};

type docFolder = {
  icon?: LucideIconName;
  name: string;
  description: string;
  outputPath: string;
  files: docFile[];
};

type docFile = {
  name: string;
  baseName: string;
  markdown: string;
  path: string;
  outputPath: string;
  config: DocConfig;
};

const process = async () => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const files = glob
    .sync(path.join(import.meta.dirname, "../src/**/*.tsx"))
    .filter((filePath) => {
      return !filePath.includes("/src/ui/");
    });

  const docs = (
    await Promise.all(
      files.map(async (filePath) => {
        const relativePath = path.relative(
          path.join(import.meta.dirname, "../src"),
          filePath,
        );

        const entrypoint = path.join(
          tmpDir,
          path.dirname(relativePath),
          `${path.basename(relativePath, ".tsx")}.mjs`,
        );

        await buildDocgenComponent(filePath, entrypoint);

        const elements = await import(entrypoint);

        const types = docgen.parse(filePath, options);

        let docConfig = Object.assign(
          {
            name: formatCamelCaseToTitle(path.basename(filePath, ".tsx")),
            description: "",
            components: {},
          } satisfies DocConfig,
          elements.__docConfig,
        );

        const templates = getTemplateContents(filePath);

        docConfig = mergeTemplateInfo(docConfig, templates);

        const baseName = path.basename(filePath, ".tsx");
        const componentEntries = Object.entries(docConfig.components);
        const flattenComponent = componentEntries.length === 1;
        const folderOutputPath = flattenComponent
          ? docsPath
          : path.join(docsPath, baseName);

        const docFiles: docFile[] = [];

        for (const [componentName, value] of componentEntries) {
          const componentDocConfig = Object.assign({
            name: componentName,
            description: flattenComponent ? docConfig.description : "",
            components: { [componentName]: value },
          });

          const outputPath = flattenComponent
            ? path.join(docsPath, `${baseName.toLocaleLowerCase()}.mdx`)
            : path.join(
                folderOutputPath,
                `${componentName.toLocaleLowerCase()}.mdx`,
              );

          const componentType = types.filter(
            (e) => e.displayName === componentName,
          );

          const markdown = await buildFileMarkdown(
            componentDocConfig,
            componentType,
          );

          docFiles.push({
            name: componentDocConfig.name,
            baseName: path.basename(filePath, ".tsx"),
            path: path
              .relative(path.join(import.meta.dirname, "../src"), filePath)
              .toLowerCase(),
            outputPath,
            markdown,
            config: componentDocConfig,
          });
        }

        return {
          icon: docConfig.icon,
          name: docConfig.name,
          description: docConfig.description,
          outputPath: folderOutputPath,
          files: docFiles,
        };
      }),
    )
  ).filter(Boolean) as docFolder[];

  fs.rmSync(docsPath, { recursive: true, force: true });
  fs.mkdirSync(docsPath, { recursive: true });

  const sortedDocs = docs.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  sortedDocs.forEach((docFile) => {
    docFile.files.forEach((file) => {
      writeGeneratedMarkdown(file.outputPath, file.markdown);
    });
  });

  fs.writeFileSync(
    path.join(docsPath, "meta.json"),
    await formatGeneratedMetadata({
      title: "Components",
      defaultOpen: true,
      pages: sortedDocs.map((docFile) => docFile.files[0]?.baseName),
    }),
  );

  for (const docFolder of sortedDocs) {
    if (docFolder.files.length <= 1) continue;

    fs.writeFileSync(
      path.join(docFolder.outputPath, "meta.json"),
      await formatGeneratedMetadata({
        title: docFolder.name,
        pages: docFolder.files.map((file) =>
          path.basename(file.outputPath, ".mdx"),
        ),
      }),
    );
  }

  // Build the card groups
  let snippet = `<Cards>`;

  sortedDocs.forEach((docFolder) => {
    const firstPage = docFolder.files[0];
    if (!firstPage) {
      return;
    }

    const componentPath = `/docs/components/${path
      .relative(docsPath, firstPage.outputPath)
      .replace(/\.mdx$/, "")
      .split(path.sep)
      .join("/")}`;

    const icon = docFolder.icon ? ` icon={<${docFolder.icon} />}` : "";

    snippet += `<Card ${mdxStringAttribute("title", docFolder.name)}${icon} ${mdxStringAttribute("href", componentPath.toLocaleLowerCase())}>
    ${docFolder.description.split(".")[0]}.
  </Card>`;
  });

  snippet += `</Cards>`;

  const templatesBuild = await buildTemplates();

  replaceGeneratedTemplatePages(
    path.join(import.meta.dirname, "../docs/content/docs/ui"),
    templatesBuild,
  );

  const templateListingPath = path.join(
    import.meta.dirname,
    "../docs/content/docs/ui/index.mdx",
  );

  const templateListingContents = await buildTemplateList(templatesBuild);

  fs.writeFileSync(templateListingPath, templateListingContents);

  const templatesMetaPath = path.join(
    import.meta.dirname,
    "../docs/content/docs/ui/templates/meta.json",
  );
  fs.writeFileSync(
    templatesMetaPath,
    await formatGeneratedMetadata(
      buildTemplateMetadata(templatesBuild, path.dirname(templatesMetaPath)),
    ),
  );

  //-------------------------------------------------------------------------------- UPDATE introduction.mdx COMPONENT CARDS --------------------------------------------------------------------------------

  const introductionPath = path.join(
    import.meta.dirname,
    "../docs/content/docs/index.mdx",
  );

  replaceInFile(introductionPath, /<Cards>[\s\S]*?<\/Cards>/, snippet);
};

process();
