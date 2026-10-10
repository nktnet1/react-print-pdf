import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import { expect, test } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const workflow = readFileSync(
  new URL("../../.github/workflows/docs-verification.yaml", import.meta.url),
  "utf8",
);

// Match both push and pull_request triggers against real project files using
// the same glob syntax as the workflow, not just a string-literal assertion.
const eventFilters = Array.from(
  workflow.matchAll(/^ {4}paths:\s*\n((?: {6}- .+\n)+)/gm),
  (section) =>
    Array.from(
      section[1].matchAll(/^ {6}- ["']?([^\n"']+)["']?$/gm),
      (match) => match[1],
    ),
);

test("documentation CI tracks every source that can affect generated documentation", () => {
  expect(eventFilters).toHaveLength(2);

  const required = [
    "src/compile/compile.tsx",
    "src/mdx.ts",
    "src/generic.css",
    "src/shell/shell.css",
    "config/katex-css.ts",
    "config/tsdown.config.ts",
    "docgen/buildTemplates.tsx",
    "scripts/register-docgen-typescript.mjs",
    "scripts/repair-declaration-exports.ts",
    "scripts/verify-docs.ts",
    "tests/docgen/template-copyable.node.test.tsx",
    "docs/pnpm-lock.yaml",
    "pnpm-lock.yaml",
    "package.json",
  ];

  for (const patterns of eventFilters) {
    const matched = new Set(
      patterns.flatMap((pattern) =>
        globSync(pattern, {
          cwd: projectRoot,
          nodir: true,
          ignore: ["docs/public/docs/images/previews/**"],
        }),
      ),
    );
    for (const source of required) {
      expect(
        matched.has(source),
        `${source} must trigger docs verification`,
      ).toBe(true);
    }
  }
});

test("documentation CI validates committed pages and previews before site compilation", () => {
  const sourceJob = workflow
    .split("  docs-source:")[1]
    ?.split("  regenerate:")[0];
  expect(sourceJob).toBeDefined();
  expect(sourceJob).toContain("run: pnpm exec tsx scripts/verify-docs.ts");
  expect(
    sourceJob?.indexOf("run: pnpm exec tsx scripts/verify-docs.ts"),
  ).toBeLessThan(sourceJob?.indexOf("run: pnpm docs:build") ?? 0);
});
