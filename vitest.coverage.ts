// The tests import the built ESM package from dist/. Vitest v4 filters V8
// coverage by executed module path BEFORE remapping source maps, so include
// those modules as well as the original source (to account for uncovered code).
// Filtering again after remapping removes third-party modules bundled by tsdown.
export const coverageThresholds = {
  lines: 20,
  statements: 20,
  functions: 15,
  branches: 10,
} as const;

export const coverage = {
  provider: "v8" as const,
  include: ["dist/**/*.js", "src/**/*.{ts,tsx}"],
  exclude: ["**/node_modules/**", "src/**/*.d.ts", "src/docgen/**"],
  excludeAfterRemap: true,
  reporter: [
    "text" as const,
    "html" as const,
    "lcov" as const,
    "json-summary" as const,
  ],
  reportOnFailure: true,
};
