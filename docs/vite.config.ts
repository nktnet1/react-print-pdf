import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig, type Plugin } from "vite";

function normalizeBasePath(value: string | undefined) {
  const base = value?.trim() || "/";
  return `/${base.replace(/^\/+|\/+$/g, "")}/`.replace("//", "/");
}

const basePath = normalizeBasePath(process.env.PUBLIC_DOCS_BASE_PATH);

export default defineConfig({
  server: {
    port: 3000,
  },
  envPrefix: "PUBLIC_",
  base: basePath,
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: "index.html",
          enabled: true,
          crawlLinks: true,
        },
      },
      pages: [{ path: "/" }, { path: "/docs" }, { path: "/api/search" }],
    }),
    generate404Page(basePath),
    react(),
  ],
  build: {
    chunkSizeWarningLimit: 1000,
  },
  resolve: {
    tsconfigPaths: true,
  },
});

function generate404Page(base: string): Plugin {
  const htmlContent = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="refresh" content="0; url=${base}" />
    <title>Redirecting...</title>
    <script>window.location.replace(${JSON.stringify(base)});</script>
  </head>
</html>`;

  return {
    name: "generate-404.html",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "404.html",
        source: htmlContent,
      });
    },
  };
}
