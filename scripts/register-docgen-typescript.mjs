import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const legacyCompilerUrl = pathToFileURL(
  require.resolve("@typescript/typescript6"),
).href;

// react-docgen-typescript needs the TypeScript compiler API, which the
// TypeScript 7 package no longer exports. Redirect only its imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "typescript" &&
      context.parentURL?.includes("/react-docgen-typescript/")
    ) {
      return { url: legacyCompilerUrl, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },
});
