import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = fileURLToPath(
  new URL("../fixtures/package-consumer/", import.meta.url),
);

const node = (script: string) =>
  execFileSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });

describe("published package entrypoints", () => {
  test("loads ESM and CommonJS exports using native Node resolution", () => {
    const script = fileURLToPath(
      new URL("../fixtures/package-consumer/runtime.mjs", import.meta.url),
    );
    expect(node(script)).toContain("package-exports-ok");
  });

  test("resolves ESM and CommonJS declaration exports in a consumer tsconfig", () => {
    const tsc = fileURLToPath(
      new URL("../../node_modules/typescript/bin/tsc", import.meta.url),
    );
    const config = fileURLToPath(
      new URL("../fixtures/package-consumer/tsconfig.json", import.meta.url),
    );

    expect(
      execFileSync(process.execPath, [tsc, "--noEmit", "--project", config], {
        cwd: fixture,
        encoding: "utf8",
        timeout: 30_000,
      }),
    ).toBe("");
  });

  test("includes every public entrypoint and its declarations in the npm tarball", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      exports: Record<
        string,
        {
          import: { default: string; types: string };
          require: { default: string; types: string };
        }
      >;
    };
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json"], {
        cwd: root,
        encoding: "utf8",
        timeout: 30_000,
      }),
    ) as { files: { path: string }[] }[];
    const packedFiles = new Set(packed[0]?.files.map((file) => file.path));

    for (const entrypoint of [".", "./client", "./playwright", "./mdx"]) {
      for (const format of ["import", "require"] as const) {
        for (const field of ["default", "types"] as const) {
          const path = manifest.exports[entrypoint]?.[format][field];
          expect(path, `${entrypoint} ${format}.${field} export`).toBeDefined();
          expect(
            packedFiles.has(path?.replace(/^\.\//, "")),
            `${entrypoint} ${format}.${field} should be included in npm pack`,
          ).toBe(true);
        }
      }
    }
    expect(packedFiles.has("dist/index.css")).toBe(true);
  });
});
