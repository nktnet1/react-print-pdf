import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { configDefaults, defineConfig } from "vitest/config";
import { tailwindCssDefines } from "#config/tailwind-css";

export default defineConfig({
  root: process.cwd(),
  // The source compiler uses the same inlined Tailwind CSS as tsdown.
  define: tailwindCssDefines,
  resolve: {
    // React and the Chromium test renderer must share their hook dispatcher.
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^#\//,
        replacement: fileURLToPath(new URL("../src/", import.meta.url)),
      },
      {
        find: /^react-print-pdf\/client$/,
        replacement: fileURLToPath(
          new URL("../src/client.ts", import.meta.url),
        ),
      },
      {
        find: /^react-print-pdf$/,
        replacement: fileURLToPath(new URL("../src/index.ts", import.meta.url)),
      },
    ],
  },
  // Prevent Vite from discovering dependencies during the running browser
  // tests: optimizer reloads can invalidate hooks and dynamic Emotion imports.
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
      "postcss-selector-parser",
      "postcss-logical",
      "tailwindcss",
    ],
  },
  build: {
    target: "esnext",
  },
  test: {
    // This config lives in config/, but test discovery starts at project root.
    dir: process.cwd(),
    name: "browser",
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
