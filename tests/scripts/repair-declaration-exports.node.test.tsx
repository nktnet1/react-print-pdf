import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  repairDeclarationValueExports,
  repairEmittedDeclarations,
} from "#scripts/repair-declaration-exports";

describe("published declaration export repair", () => {
  test("restores value exports without promoting real type-only declarations", () => {
    const source = [
      "declare const CSS: (text: string) => string;",
      "declare function Margins(): void;",
      "type TypeOnly = string;",
      "interface NotAValue { name: string }",
      "export { type CSS as a, type TypeOnly as b, type Margins as c, type NotAValue as d };",
      'export { type ExternalValue } from "external";',
      "",
    ].join("\n");

    const expected = source
      .replace("type CSS as a", "CSS as a")
      .replace("type Margins as c", "Margins as c");
    expect(repairDeclarationValueExports(source)).toBe(expected);
    expect(repairDeclarationValueExports(expected)).toBe(expected);
  });

  test("does not promote names merely mentioned in comments or type aliases", () => {
    const source = [
      "/** declare const Phantom: string; */",
      "type Phantom = string;",
      "export { type Phantom };",
      "",
    ].join("\n");
    expect(repairDeclarationValueExports(source)).toBe(source);
  });

  test("repairs emitted ESM and CommonJS declaration chunks only", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pdf-declarations-"));
    try {
      const invalid =
        "declare const CSS: () => void;\nexport { type CSS as a };\n";
      const targets = ["entry.d.ts", "entry.d.cts"];
      for (const filename of targets) {
        await writeFile(join(directory, filename), invalid);
      }
      await writeFile(join(directory, "entry.js"), invalid);
      await repairEmittedDeclarations(directory);
      for (const filename of targets) {
        expect(await readFile(join(directory, filename), "utf8")).toContain(
          "export { CSS as a }",
        );
      }
      expect(await readFile(join(directory, "entry.js"), "utf8")).toBe(invalid);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
