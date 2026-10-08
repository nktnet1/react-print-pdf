import { defineConfig } from "vitest/config";

// Run the Node and real-Chromium source suites in one Vitest invocation so V8
// can merge their coverage by source location, rather than double-counting hits.
export default defineConfig({
  test: {
    projects: ["./vitest.node.config.ts", "./vitest.browser.config.ts"],
    // Collect source coverage across Node and Chromium in one run. The separate
    // checker in scripts/check-source-coverage.ts enforces the shared thresholds.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["**/node_modules/**", "src/**/*.d.ts", "src/docgen/**"],
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage/combined",
      reportOnFailure: true,
    },
  },
});
