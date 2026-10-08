import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { coverage } from "./vitest.coverage";

export default defineConfig({
  resolve: {
    // The published build externalizes React. Its hooks and the browser test
    // renderer must therefore resolve to the same React instance.
    dedupe: ["react", "react-dom"],
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
  // The browser tests import react-dom/client and dynamically import Emotion
  // dependencies during compilation. Discovering these after startup causes
  // Vite to reload the test iframe, invalidating React's hook dispatcher and
  // the URLs of previously optimized modules.
  optimizeDeps: {
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
      "react-dom/server",
      "@emotion/react",
      "@emotion/cache",
      "postcss-css-variables",
      "postcss-logical",
    ],
  },
  build: {
    target: "esnext",
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: { ...coverage, reportsDirectory: "coverage/browser" },
    exclude: [...configDefaults.exclude, "tests/**/*.node.test.tsx"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
