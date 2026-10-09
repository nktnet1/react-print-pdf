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
