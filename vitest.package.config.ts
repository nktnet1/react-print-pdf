import { defineConfig } from "vitest/config";

// Deliberately no aliases: these tests must resolve the actual package exports
// and inspect the artifacts produced by tsdown.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/bun.node.test.tsx",
      "tests/package-entrypoints.node.test.tsx",
      "tests/package-bundle.node.test.tsx",
      "tests/vercel.node.test.tsx",
    ],
  },
});
