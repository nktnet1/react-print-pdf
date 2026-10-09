import { dirname } from "node:path";

// Docgen evaluates these bundles alongside the published package's React
// renderer. Inlining dependencies would create a second React dispatcher and
// break hooks inside components such as Tailwind.
export const docgenDependencies = { neverBundle: true } as const;

export const buildDocgenComponent = async (
  filePath: string,
  entrypoint: string,
) => {
  const [{ build }, { default: Raw }] = await Promise.all([
    import("tsdown"),
    import("unplugin-raw/rolldown"),
  ]);

  await build({
    entry: [filePath],
    dts: false,
    outDir: dirname(entrypoint),
    format: "esm",
    platform: "node",
    sourcemap: false,
    config: false,
    clean: false,
    deps: docgenDependencies,
    plugins: [Raw()],
  });
};
