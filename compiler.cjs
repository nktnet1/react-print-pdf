"use strict";

// Keep CommonJS imports from evaluating React DOM and the Tailwind context.
// The CJS bundle produced by Rolldown hoists modules from dynamic imports;
// this tiny source-level facade preserves the lazy boundary for Node consumers.
exports.compile = async (...args) => {
  const { compile } = await import("#compiler-runtime");
  return compile(...args);
};
