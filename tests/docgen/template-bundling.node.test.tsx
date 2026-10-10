import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { bundleTemplate } from "../../docgen/bundleTemplate";

const templateRoot = fileURLToPath(
  new URL("../../src/ui/templates/", import.meta.url),
);

test("every maintained MDX template bundles for the documentation generator", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "react-print-mdx-bundling-"));

  try {
    for (const filename of readdirSync(templateRoot)
      .filter((name) => name.endsWith(".mdx"))
      .sort()) {
      const modulePath = await bundleTemplate(
        join(templateRoot, filename),
        outputRoot,
      );
      expect(existsSync(modulePath), `${filename} bundle exists`).toBe(true);
    }
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}, 90_000);
