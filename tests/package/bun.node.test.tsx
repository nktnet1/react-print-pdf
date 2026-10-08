import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });

// Local Node-only runs may skip this test. Release CI installs Bun explicitly.
test.skipIf(bun.error !== undefined || bun.status !== 0)(
  "Bun imports the ESM package and parses the original LaTeX example (issue #49)",
  () => {
    const fixture = fileURLToPath(
      new URL("../fixtures/bun-issue-49.mjs", import.meta.url),
    );
    const result = spawnSync("bun", [fixture], {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      encoding: "utf8",
      timeout: 20_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("bun-import-ok");
  },
);
