import * as fs from "fs";
import * as glob from "glob";
import * as path from "path";
import * as docgen from "react-docgen-typescript";
import { buildFileMarkdown } from "./buildFileMarkdown";
import { buildTemplateList, buildTemplates } from "./buildTemplates";
import { replaceInFile } from "./pageBuilder/buildIntroduction";
import type { DocConfig, LucideIconName } from "./types";
import {
  formatCamelCaseToTitle,
  getTemplateContents,
  mergeTemplateInfo,
} from "./utils";

const tmpDir = path.join(__dirname, "../.tmp");
const docsPath = path.join(__dirname, "../docs/content/docs/components");

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

  const [{ build }, { default: Raw }] = await Promise.all([
    import("tsdown"),
    import("unplugin-raw/rolldown"),
  ]);

  const files = glob
    .sync(path.join(__dirname, "../src/**/*.tsx"))
    .filter((filePath) => {
      return !filePath.includes("/src/ui/");
    });

  const docs = (
    await Promise.all(
      files.map(async (filePath) => {
        const relativePath = path.relative(
          path.join(__dirname, "../src"),
          filePath,
        );

        const entrypoint = path.join(
          tmpDir,
          path.dirname(relativePath),
          `${path.basename(relativePath, ".tsx")}.mjs`,
        );

        await build({
          entry: [filePath],
          dts: false,
          outDir: path.dirname(entrypoint),
          format: "esm",
          platform: "node",
          sourcemap: false,
          config: false,
          clean: false,
          plugins: [Raw()],
        });

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
              .relative(path.join(__dirname, "../src"), filePath)
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

  // Check if the directory exists, if not, create it
  function checkDirectorySync(directory: string, remove: boolean = true) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    } else {
      if (remove) {
        fs.rmSync(directory, { recursive: true });
      }
      fs.mkdirSync(directory, { recursive: true });
    }
  }

  checkDirectorySync(docsPath);

  const sortedDocs = docs.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  sortedDocs.forEach((docFile) => {
    docFile.files.forEach((file) => {
      checkDirectorySync(docFile.outputPath, false);

      fs.writeFileSync(file.outputPath, file.markdown);
    });
  });

  fs.writeFileSync(
    path.join(docsPath, "meta.json"),
    JSON.stringify(
      {
        title: "Components",
        defaultOpen: true,
        pages: sortedDocs.map((docFile) => docFile.files[0]?.baseName),
      },
      null,
      2,
    ),
  );

  sortedDocs.forEach((docFolder) => {
    if (docFolder.files.length <= 1) {
      return;
    }

    fs.writeFileSync(
      path.join(docFolder.outputPath, "meta.json"),
      JSON.stringify(
        {
          title: docFolder.name,
          pages: docFolder.files.map((file) =>
            path.basename(file.outputPath, ".mdx"),
          ),
        },
        null,
        2,
      ),
    );
  });

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

    snippet += `<Card title="${docFolder.name}"${icon} href="${componentPath.toLocaleLowerCase()}">
    ${docFolder.description.split(".")[0]}.
  </Card>`;
  });

  snippet += `</Cards>`;

  const templatesBuild = await buildTemplates();

  templatesBuild.forEach((template) => {
    const dirname = path.dirname(template.outputPath);

    if (!fs.existsSync(dirname)) {
      fs.mkdirSync(dirname, { recursive: true });
    }

    fs.writeFileSync(template.outputPath, template.markdown);
  });

  const templateListingPath = path.join(
    __dirname,
    "../docs/content/docs/ui/index.mdx",
  );

  const templateListingContents = await buildTemplateList(templatesBuild);

  fs.writeFileSync(templateListingPath, templateListingContents);

  const templatesMetaPath = path.join(
    __dirname,
    "../docs/content/docs/ui/templates/meta.json",
  );
  const templateCategories = templatesBuild.reduce<Record<string, string[]>>(
    (acc, template) => {
      const category = template.category || "Uncategorized";
      acc[category] ??= [];
      acc[category].push(path.basename(template.outputPath, ".mdx"));
      return acc;
    },
    {},
  );
  const templatePages = Object.entries(templateCategories).flatMap(
    ([category, pages]) => [`---${category}---`, ...pages],
  );

  fs.writeFileSync(
    templatesMetaPath,
    JSON.stringify({ title: "Examples", pages: templatePages }, null, 2),
  );

  //-------------------------------------------------------------------------------- UPDATE introduction.mdx COMPONENT CARDS --------------------------------------------------------------------------------

  const introductionPath = path.join(
    __dirname,
    "../docs/content/docs/index.mdx",
  );

  replaceInFile(introductionPath, /<Cards>[\s\S]*?<\/Cards>/, snippet);
};

process();
