import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Use exactly the same CSS sources for the published bundle and source tests.
// Tailwind's compiler does not expand these imports on its own.
const require = createRequire(import.meta.url);
/** @param {string} file */
const cssAsLiteral = (file) =>
  JSON.stringify(readFileSync(require.resolve(file), "utf8"));

export const tailwindCssDefines = {
  __REACT_PRINT_TAILWIND_THEME_CSS__: cssAsLiteral("tailwindcss/theme.css"),
  __REACT_PRINT_TAILWIND_PREFLIGHT_CSS__: cssAsLiteral(
    "tailwindcss/preflight.css",
  ),
};
