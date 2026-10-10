import { basename, dirname, join, relative } from "node:path";
import remarkFrontmatter from "remark-frontmatter";
import type { TsdownPlugin } from "tsdown";
import { docgenDependencies } from "#docgen/bundling";

const sourceRoot = join(import.meta.dirname, "../src");
const tempRoot = join(import.meta.dirname, "../.tmp");

/** Bundle maintained MDX template source without rendering its PDF preview. */
export const bundleTemplate = async (
  template: string,
  outputRoot = tempRoot,
): Promise<string> => {
  const [{ default: mdx }, { build }, { default: Raw }] = await Promise.all([
    import("@mdx-js/rollup"),
    import("tsdown"),
    import("unplugin-raw/rolldown"),
  ]);

  const outPath = join(
    outputRoot,
    dirname(relative(sourceRoot, template)),
    `${basename(template, ".mdx")}.mjs`,
  );

  await build({
    entry: [template],
    plugins: [
      mdx({
        remarkPlugins: [remarkFrontmatter],
        providerImportSource: "react-print-pdf/mdx",
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
    deps: docgenDependencies,
  });

  return outPath;
};
