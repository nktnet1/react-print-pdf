import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { compile } from "react-print-pdf/compiler";
import { Markdown, Tailwind } from "react-print-pdf/components";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);

const runWithReactServerCondition = (script: string, cjs = false) =>
  execFileSync(
    process.execPath,
    [
      "--conditions=react-server",
      ...(cjs ? [] : ["--input-type=module"]),
      "-e",
      script,
    ],
    { cwd: root, encoding: "utf8", timeout: 20_000 },
  );

describe("published compiler/component dependency boundary", () => {
  test("ESM compiler import does not eagerly evaluate React DOM or context providers", () => {
    expect(
      runWithReactServerCondition(`
        import { compile } from "react-print-pdf/compiler";
        if (typeof compile !== "function") throw new Error("compile export missing");
        console.log("compiler-imported");
      `),
    ).toContain("compiler-imported");
  });

  test("CommonJS compiler import does not eagerly evaluate React DOM or context providers", () => {
    expect(
      runWithReactServerCondition(
        `const { compile } = require("react-print-pdf/compiler");
         if (typeof compile !== "function") throw new Error("compile export missing");
         console.log("compiler-required");`,
        true,
      ),
    ).toContain("compiler-required");
  });

  test("components do not load the server renderer", () => {
    const components = require("react-print-pdf/components");
    expect(typeof components.Markdown).toBe("function");
    expect(components.compile).toBeUndefined();
    expect(
      Object.keys(require.cache).some((path) =>
        /[/\\]react-dom[/\\](?:server|cjs[/\\]react-dom-server)/.test(path),
      ),
    ).toBe(false);
  });

  test("isolated compiler renders Tailwind components under standard Node React", async () => {
    const html = await compile(
      createElement(
        Tailwind,
        null,
        createElement(Markdown, null, "# Independent compiler"),
      ),
    );
    expect(html).toContain("Independent compiler");
    expect(html).toContain("data-react-print-tailwind-start");
  });
});
