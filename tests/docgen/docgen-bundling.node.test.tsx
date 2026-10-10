import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { buildDocgenComponent } from "../../docgen/bundling";

test("docgen's bundled signature preview shares the server React renderer", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const tempRoot = join(root, ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const outputDir = await mkdtemp(join(tempRoot, "docgen-test-"));
  const source = fileURLToPath(
    new URL("../../src/signature/signature.tsx", import.meta.url),
  );
  const entrypoint = join(outputDir, "signature.mjs");

  try {
    await buildDocgenComponent(source, entrypoint);
    const { __docConfig } = await import(pathToFileURL(entrypoint).href);
    const example = __docConfig.components.Field.examples.default.template;
    const html = renderToString(example);

    expect(html).toContain("data-react-print-sign");
    expect(html).toContain("Signature");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}, 30_000);

test("standalone docgen previews receive the package's KaTeX and Tailwind CSS", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const tempRoot = join(root, ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const outputDir = await mkdtemp(join(tempRoot, "docgen-css-test-"));

  try {
    const latexSource = fileURLToPath(
      new URL("../../src/latex/latex.tsx", import.meta.url),
    );
    const latexEntry = join(outputDir, "latex.mjs");
    await buildDocgenComponent(latexSource, latexEntry);
    const { __docConfig: latexDocs } = await import(
      pathToFileURL(latexEntry).href
    );
    const latexMarkup = renderToString(
      latexDocs.components.Latex.examples.default.template,
    );
    expect(latexMarkup).toContain('class="katex"');
    expect(latexMarkup).toContain("data:font/woff2;base64,");

    const tailwindSource = fileURLToPath(
      new URL("../../src/tailwind/tailwind.tsx", import.meta.url),
    );
    const tailwindEntry = join(outputDir, "tailwind.mjs");
    await buildDocgenComponent(tailwindSource, tailwindEntry);
    const {
      createTailwindStyleCollector,
      TailwindStyleCollectorProvider,
      Tailwind,
    } = await import(pathToFileURL(tailwindEntry).href);
    const collector = createTailwindStyleCollector();
    const template = (
      <TailwindStyleCollectorProvider collector={collector}>
        <Tailwind preflight={false}>
          <p className="text-red-500">Document preview</p>
        </Tailwind>
      </TailwindStyleCollectorProvider>
    );
    const markup = await collector.resolve(renderToString(template));
    expect(markup).toContain("Document preview");
    expect(markup).toMatch(/\.text-red-500\s*\{[^}]*color:/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}, 30_000);
