import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  license: string;
};

const symlinkDependency = (
  name: string,
  source: string,
  nodeModules: string,
) => {
  const destination = join(nodeModules, name);
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(realpathSync(source), destination, "dir");
};

const installedReact = (version: "18" | "19", name: "react" | "react-dom") => {
  const pnpmStore = join(root, "node_modules", ".pnpm");
  const folder =
    version === "18"
      ? name === "react"
        ? "react@18.3.1"
        : "react-dom@18.3.1_react@18.3.1"
      : name === "react"
        ? "react@19.3.0"
        : "react-dom@19.3.0_react@19.3.0";
  return join(pnpmStore, folder, "node_modules", name);
};

const smoke = (version: "18" | "19") => {
  const temporary = mkdtempSync(
    join(tmpdir(), `react-print-consumer-${version}-`),
  );
  try {
    const nodeModules = join(temporary, "node_modules");
    const packageDir = join(nodeModules, "react-print-pdf");
    mkdirSync(packageDir, { recursive: true });
    cpSync(join(root, "dist"), join(packageDir, "dist"), {
      recursive: true,
    });
    cpSync(join(root, "package.json"), join(packageDir, "package.json"));
    writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n');

    for (const name of Object.keys(manifest.dependencies)) {
      symlinkDependency(name, join(root, "node_modules", name), nodeModules);
    }
    for (const name of ["react", "react-dom"] as const) {
      symlinkDependency(name, installedReact(version, name), nodeModules);
    }

    writeFileSync(
      join(temporary, "consumer.mjs"),
      `import React from "react";
import { compile, Markdown, Tailwind, Latex } from "react-print-pdf";
const html = await compile(React.createElement("main", null,
  React.createElement(Markdown, null, "# Consumer invoice"),
  React.createElement(Tailwind, null, React.createElement("p", { className: "text-red-500" }, "Paid")),
  React.createElement(Latex, null, "x^2"),
  React.createElement(Latex, null, "y^3")
));
if (!html.includes("Consumer invoice") || !html.includes("Paid") || !html.includes('class="katex"')) {
  throw new Error("Consumer document was not compiled correctly");
}
if ((html.match(/(?:data-)?href="react-print-pdf-katex"/g) ?? []).length !== 1) {
  throw new Error("Multiple formulas must share exactly one KaTeX stylesheet");
}
console.log(React.version);
`,
    );

    return execFileSync(process.execPath, [join(temporary, "consumer.mjs")], {
      cwd: temporary,
      encoding: "utf8",
      timeout: 30_000,
    }).trim();
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

describe("published React consumer integration", () => {
  test("declares app-owned React and React DOM peers, not nested runtime dependencies", () => {
    for (const name of ["react", "react-dom"] as const) {
      expect(manifest.dependencies[name]).toBeUndefined();
      expect(manifest.peerDependencies[name]).toBe("^18.3.1 || ^19.0.0");
      expect(manifest.devDependencies[name]).toBeDefined();
    }
  });

  test("advertises the included Apache-2.0 licence", () => {
    expect(readFileSync(join(root, "LICENSE.md"), "utf8")).toContain(
      "Apache License",
    );
    expect(manifest.license).toBe("Apache-2.0");
  });

  test("does not install build-only native Rollup bindings into consumer projects", () => {
    expect(
      manifest.optionalDependencies?.["@rollup/rollup-linux-x64-gnu"],
    ).toBeUndefined();
  });

  test("compiles a real document inside an isolated React 19 consumer", () => {
    expect(smoke("19")).toMatch(/^19\./);
  }, 45_000);

  test.skipIf(
    !existsSync(installedReact("18", "react")) ||
      !existsSync(installedReact("18", "react-dom")),
  )(
    "compiles a real document inside an isolated React 18 consumer",
    () => {
      expect(smoke("18")).toMatch(/^18\./);
    },
    45_000,
  );
});
