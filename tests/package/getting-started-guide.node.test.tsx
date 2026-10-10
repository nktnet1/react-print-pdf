import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const guide = fileURLToPath(
  new URL("../../docs/content/docs/getting-started/setup.mdx", import.meta.url),
);
const tsx = fileURLToPath(
  new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);

test("the getting-started TSX examples run in a new project without a tsconfig", () => {
  const source = readFileSync(guide, "utf8");
  const documentSource = source.match(
    /```tsx title="document\/index\.tsx"\n([\s\S]*?)\n```/,
  )?.[1];
  const renderSource = source.match(
    /Create `render\.tsx`[\s\S]*?```tsx\n([\s\S]*?)\n```/,
  )?.[1];

  expect(documentSource).toBeDefined();
  expect(renderSource).toBeDefined();
  expect(source).toContain("npm pkg set type=module");

  const temporary = mkdtempSync(join(tmpdir(), "react-print-getting-started-"));
  try {
    mkdirSync(join(temporary, "document"));
    const nodeModules = join(temporary, "node_modules");
    mkdirSync(nodeModules);
    symlinkSync(root, join(nodeModules, "react-print-pdf"), "dir");
    for (const name of ["react", "react-dom"]) {
      symlinkSync(
        join(root, "node_modules", name),
        join(nodeModules, name),
        "dir",
      );
    }
    writeFileSync(
      join(temporary, "package.json"),
      JSON.stringify({ name: "getting-started-consumer", type: "module" }),
    );
    writeFileSync(join(temporary, "document/index.tsx"), documentSource ?? "");
    writeFileSync(join(temporary, "render.tsx"), renderSource ?? "");

    // Run exactly the published guide snippets in the newly initialised
    // ESM project, without a tsconfig or fresh installs. Use the built
    // package and existing React dependencies as a local consumer fixture.
    const output = execFileSync(
      process.execPath,
      [tsx, join(temporary, "render.tsx")],
      { cwd: temporary, encoding: "utf8", timeout: 30_000 },
    );

    expect(output).toContain("Quarterly report");
    expect(output).toContain("Appendix");
    expect(output).toContain("react-print-page-break");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}, 35_000);
