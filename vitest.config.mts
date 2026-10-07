import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@fileforge/react-print": fileURLToPath(
        new URL("./dist/index.mjs", import.meta.url),
      ),
    },
  },
  build: {
    target: "esnext",
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
  },
});
