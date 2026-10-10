import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const metrics = ["lines", "statements", "functions", "branches"] as const;
type Metric = (typeof metrics)[number];

type Count = { covered: number; total: number; pct: number };

const runCoverageGate = (missing?: Metric) => {
  const directory = mkdtempSync(join(tmpdir(), "react-print-coverage-"));
  try {
    const source = Object.fromEntries(
      metrics.map((metric) => [
        metric,
        {
          covered: metric === missing ? 99 : 100,
          total: 100,
          pct: metric === missing ? 99 : 100,
        } satisfies Count,
      ]),
    );
    const reportPath = join(directory, "coverage-summary.json");
    writeFileSync(
      reportPath,
      JSON.stringify({
        total: source,
        "src/compile/compile.tsx": source,
        // Non-source entries must not mask an uncovered production branch.
        "tests/compile/compile.test.tsx": source,
      }),
    );
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/check-source-coverage.ts", reportPath],
      { cwd: projectRoot, encoding: "utf8", timeout: 20000 },
    );
    if (result.error) throw result.error;
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("source coverage gate", () => {
  test("accepts complete source coverage", () => {
    const result = runCoverageGate();
    expect(result.status, result.output).toBe(0);
    for (const metric of metrics) {
      expect(result.output).toContain(`${metric}: 100.00%`);
    }
  });

  test.each(metrics)("rejects even one uncovered %s", (metric) => {
    const result = runCoverageGate(metric);
    expect(result.status, result.output).not.toBe(0);
    expect(result.output).toContain(`${metric}: 99.00%`);
    expect(result.output).toContain("Source coverage is below the threshold");
  });
});
