import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

test("browser bundle has no Emotion server or Node stream imports", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies?: Record<string, string>;
  };
  const clientBundle = await readFile(
    new URL("../../dist/client/index.js", import.meta.url),
    "utf8",
  );

  expect(packageJson.dependencies?.["@emotion/server"]).toBeUndefined();
  expect(clientBundle).not.toContain("@emotion/server");
  expect(clientBundle).not.toContain("html-tokenize");
  expect(clientBundle).not.toContain("multipipe");
  expect(clientBundle).not.toMatch(
    /(?:from\s*|import\()(["'])(?:node:)?(?:stream|events)\1/,
  );
  expect(clientBundle).not.toMatch(
    /require\(\s*(["'])(?:node:)?(?:stream|events)\1\s*\)/,
  );
});
