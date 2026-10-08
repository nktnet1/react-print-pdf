import nodePolyfills from "@rolldown/plugin-node-polyfills";
import { defineConfig } from "tsdown";
import Raw from "unplugin-raw/rolldown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    mdx: "src/mdx.ts",
    "client/index": "src/client.ts",
    "server/index": "src/server.ts",
  },
  format: ["esm", "cjs"],
  platform: "browser",
  // Let package.json type=module drive .js (ESM) / .cjs (CommonJS) extensions.
  fixedExtension: false,
  inputOptions: {
    checks: {
      // React ecosystem packages commonly use "use client" markers. Once these
      // dependencies are intentionally bundled, there is no per-module boundary
      // for Rolldown to preserve, so this warning is not actionable here.
      moduleLevelDirective: false,
    },
  },
  sourcemap: true,
  dts: true,
  css: {
    fileName: "index.css",
    splitting: false,
  },
  deps: {
    onlyBundle: false,
    neverBundle: ["react", "react-dom"],
    alwaysBundle: [
      "@csstools/postcss-is-pseudo-class",
      "@emotion/cache",
      "@emotion/react",
      "@emotion/server",
      "html-entities",
      "katex",
      "markdown-to-jsx",
      "tailwindcss",
    ],
  },
  plugins: [Raw(), nodePolyfills()],
});
