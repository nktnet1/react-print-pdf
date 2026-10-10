import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * rolldown-plugin-dts can emit `export { type Foo as x }` even when Foo is a
 * declared runtime value in the same declaration chunk. That makes the public
 * component unusable from TypeScript despite a working JavaScript export.
 * Only remove `type` when the declaration chunk itself declares that name
 * as a runtime value.
 */
export const repairDeclarationValueExports = (contents: string): string => {
  const runtimeNames = new Set<string>();
  // Declaration bundles use top-level `declare` statements. Never promote a
  // type alias unless there is a runtime declaration with exactly that name.
  for (const match of contents.matchAll(
    /^(?:export\s+)?declare\s+(?:const|let|var|function|class|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    runtimeNames.add(match[1]);
  }

  // Rolldown emits `export { type CSS as b, Markdown as c };`. These lines
  // refer to declarations in the same chunk, not external `from` modules.
  return contents.replace(
    /^export\s*\{([^}]+)\}\s*;/gm,
    (statement, list: string) => {
      const repaired = list.replace(
        /(^|,)(\s*)type\s+([A-Za-z_$][\w$]*)(?=\s|,|$)/g,
        (specifier, separator: string, whitespace: string, name: string) =>
          runtimeNames.has(name)
            ? `${separator}${whitespace}${name}`
            : specifier,
      );
      return statement.replace(list, repaired);
    },
  );
};

/** Repair only generated declaration chunks; never edit committed source. */
export const repairEmittedDeclarations = async (directory: string) => {
  const visit = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const filename = join(path, entry.name);
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (/\.d\.(?:ts|cts|mts)$/.test(entry.name)) {
        const original = await readFile(filename, "utf8");
        const repaired = repairDeclarationValueExports(original);
        if (repaired !== original) await writeFile(filename, repaired);
      }
    }
  };
  await visit(directory);
};
