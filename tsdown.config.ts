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
  sourcemap: true,
  dts: true,
  css: {
    fileName: "index.css",
    splitting: false,
  },
  deps: {
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
