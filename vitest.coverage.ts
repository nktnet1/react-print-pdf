// Both runners exercise the compiled package. tsdown's source maps let Vitest
// attribute executed bundle code to the original, first-party source files.
// Keep the same conservative baseline for Node and Chromium until their
// measured coverage can justify higher thresholds.
export const coverage = {
  provider: "v8" as const,
  include: ["src/**/*.{ts,tsx}"],
  exclude: ["src/**/*.d.ts", "src/docgen/**"],
  reporter: [
    "text" as const,
    "html" as const,
    "lcov" as const,
    "json-summary" as const,
  ],
  reportOnFailure: true,
  thresholds: {
    lines: 20,
    statements: 20,
    functions: 15,
    branches: 10,
  },
};
