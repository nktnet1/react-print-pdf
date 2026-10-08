import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "react-print-pdf": fileURLToPath(
        new URL("./dist/index.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.node.test.tsx"],
  },
});
