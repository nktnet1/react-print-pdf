import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, root), "utf8");

test("the package README stays focused on consumers", () => {
  const readme = read("README.md");
  expect(readme).toContain("npm install react-print-pdf");
  expect(readme).toContain(
    'import { PageBreak } from "react-print-pdf/client"',
  );
  expect(readme).toContain("/DEVELOPMENT.md");
  expect(readme).not.toMatch(/^## Development\s*$/m);
  expect(readme).not.toMatch(/\b(fork note|handover|patch|ChatGPT)\b/i);
});

test("maintainer guidance is separate from the end-user documentation", () => {
  const development = read("DEVELOPMENT.md");
  expect(development).toContain("pnpm test:coverage");
  expect(development).toContain("pnpm build-components-commit");
  expect(development).toContain("scripts/RELEASING.md");
  expect(existsSync(new URL("MAINTAINER_HANDOVER.md", root))).toBe(false);

  const navigation = JSON.parse(read("docs/content/docs/meta.json")) as {
    pages: string[];
  };
  expect(navigation.pages).not.toContain("contributing");
  expect(existsSync(new URL("docs/content/docs/contributing.mdx", root))).toBe(
    false,
  );
  expect(read("docs/content/docs/index.mdx")).not.toContain(
    "/docs/contributing",
  );
});

test("maintained documentation contains no assistant or incremental-patch notes", () => {
  for (const file of [
    "README.md",
    "DEVELOPMENT.md",
    "scripts/RELEASING.md",
    "scripts/OFFLINE_ARTIFACTS.md",
    "docs/content/docs/index.mdx",
    "scripts/create-offline-artifacts.ts",
  ]) {
    expect(read(file), file).not.toMatch(
      /\b(?:ChatGPT|OpenAI|GPT|LLM|assistant handover|incremental patches?)\b/i,
    );
  }
});
