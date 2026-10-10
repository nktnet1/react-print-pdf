import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pnpmStore = join(root, "node_modules", ".pnpm");

const typescriptConsumer = (version: "18" | "19") => {
  const directory = mkdtempSync(join(tmpdir(), "react-print-ts-consumer-"));
  try {
    const modules = join(directory, "node_modules");
    const packageDir = join(modules, "react-print-pdf");
    mkdirSync(packageDir, { recursive: true });
    cpSync(join(root, "dist"), join(packageDir, "dist"), {
      recursive: true,
    });
    cpSync(join(root, "package.json"), join(packageDir, "package.json"));

    const link = (name: string, path: string) => {
      const target = join(modules, name);
      mkdirSync(dirname(target), { recursive: true });
      symlinkSync(path, target, "dir");
    };
    const reactVersion = version === "18" ? "18.3.1" : "19.3.0";
    const typesVersion = version === "18" ? "18.3.31" : "19.3.0";
    link("react", join(pnpmStore, `react@${reactVersion}/node_modules/react`));
    link(
      "@types/react",
      join(pnpmStore, `@types+react@${typesVersion}/node_modules/@types/react`),
    );
    link(
      "@types/react-dom",
      join(
        pnpmStore,
        version === "18"
          ? "@types+react-dom@18.3.7_@types+react@18.3.31"
          : "@types+react-dom@19.3.0_@types+react@19.3.0",
        "node_modules/@types/react-dom",
      ),
    );
    writeFileSync(join(directory, "package.json"), '{"type":"module"}');
    writeFileSync(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "react-jsx",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: [],
        },
        include: ["consumer.tsx"],
      }),
    );
    writeFileSync(
      join(directory, "consumer.tsx"),
      `import { CSS, Margins, RunningH3, RunningH6, CurrentPageTop, Markdown, compile } from "react-print-pdf";
import { CSS as ClientCSS, RunningH3 as ClientH3 } from "react-print-pdf/client";
const markup = <><CSS>{"h1 { color: blue }"}</CSS><Margins pageRatio="A4" top="20" bottom="20" left="20" right="20" /><CurrentPageTop /><RunningH3 /><RunningH6 /><Markdown># Heading</Markdown><ClientCSS>{"p { color: red }"}</ClientCSS><ClientH3 /></>;
void compile(markup);
`,
    );
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/typescript/bin/tsc"),
        "--project",
        "tsconfig.json",
      ],
      { cwd: directory, encoding: "utf8", timeout: 40_000 },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const react18Available = existsSync(
  join(pnpmStore, "@types+react@18.3.31/node_modules/@types/react"),
);

describe("published TypeScript components", () => {
  test("React 19 consumers can use public JSX value exports", () => {
    typescriptConsumer("19");
  }, 45_000);

  test.skipIf(!react18Available)(
    "React 18 consumers can use public JSX value exports",
    () => {
      typescriptConsumer("18");
    },
    45_000,
  );
});
