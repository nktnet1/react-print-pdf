import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import { tailwindCssDefines } from "./build/tailwind-css.js";

export default defineConfig({
  define: tailwindCssDefines,
  resolve: {
    alias: [
      {
        find: /^#\//,
        replacement: fileURLToPath(new URL("./src/", import.meta.url)),
      },
      {
        find: /^react-print-pdf\/playwright$/,
        replacement: fileURLToPath(
          new URL("./src/playwright/index.ts", import.meta.url),
        ),
      },
      {
        find: /^react-print-pdf$/,
        replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    name: "node",
    environment: "node",
    // Vitest stubs CSS imports to empty strings by default. The compiler
    // imports its print stylesheet using ?raw, so source tests must allow Vite
    // to load those files or pagination and footnote CSS disappear entirely.
    css: {
      include: [/\.css(?:\?.*)?$/],
    },
    include: ["tests/**/*.node.test.tsx"],
    exclude: [
      ...configDefaults.exclude,
      // These test the real built package, not the source aliases.
      "tests/bun.node.test.tsx",
      "tests/package-entrypoints.node.test.tsx",
      "tests/package-bundle.node.test.tsx",
      "tests/vercel.node.test.tsx",
    ],
  },
});
