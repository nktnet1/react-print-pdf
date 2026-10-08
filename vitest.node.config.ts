import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-print-pdf\/playwright$/,
        replacement: fileURLToPath(
          new URL("./dist/playwright/index.js", import.meta.url),
        ),
      },
      {
        find: /^react-print-pdf$/,
        replacement: fileURLToPath(new URL("./dist/index.js", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.node.test.tsx"],
  },
});
