import { readFileSync } from "node:fs";
import { coverageThresholds } from "#config/vitest.coverage";

type Metric = keyof typeof coverageThresholds;
type Counts = { total: number; covered: number };
type Summary = Record<Metric, Counts>;

const isSource = (filename: string) => {
  const normalized = filename.replaceAll("\\", "/");
  return (
    /(^|\/)src\/.+\.(ts|tsx)$/.test(normalized) && !normalized.endsWith(".d.ts")
  );
};

const reportPath = process.argv[2];
if (!reportPath) {
  throw new Error("Expected a path to Vitest's coverage-summary.json report");
}

const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<
  string,
  Summary
>;
const sourceFiles = Object.entries(report).filter(([filename]) =>
  isSource(filename),
);

if (
  sourceFiles.length === 0 ||
  !sourceFiles.some(([, counts]) => counts.lines.covered > 0)
) {
  throw new Error(
    `No executed src/ code found in ${reportPath}. Check that Vitest source tests ran with V8 coverage enabled.`,
  );
}

let failed = false;
for (const metric of Object.keys(coverageThresholds) as Metric[]) {
  const { covered, total } = sourceFiles.reduce<Counts>(
    (counts, [, summary]) => ({
      covered: counts.covered + summary[metric].covered,
      total: counts.total + summary[metric].total,
    }),
    { covered: 0, total: 0 },
  );
  const percentage = total === 0 ? 100 : (covered / total) * 100;
  const minimum = coverageThresholds[metric];
  console.log(
    `${metric}: ${percentage.toFixed(2)}% (${covered}/${total} src/; minimum ${minimum}%)`,
  );
  if (percentage < minimum) {
    failed = true;
  }
}

if (failed) {
  throw new Error(`Source coverage is below the threshold in ${reportPath}`);
}
