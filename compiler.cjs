"use strict";

// Preserve the lazy compiler boundary for CommonJS consumers. Rolldown's
// generated CJS entry eagerly loads the Tailwind implementation even though
// compile() uses a dynamic import.
exports.compile = async (...args) => {
  const { compile } = await import("#compiler-runtime");
  return compile(...args);
};
