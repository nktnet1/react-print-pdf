import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-print-pdf\/client$/,
        replacement: fileURLToPath(
          new URL("./dist/client/index.js", import.meta.url),
        ),
      },
      {
        find: /^react-print-pdf$/,
        replacement: fileURLToPath(new URL("./dist/index.js", import.meta.url)),
      },
    ],
  },
  build: {
    target: "esnext",
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "tests/**/*.node.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
