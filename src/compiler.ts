// Keep the compiler implementation and its React DOM/Tailwind dependencies
// out of this entrypoint's eager module graph. This is intentionally a lazy
// import: applications may import the API without evaluating the renderer.
export type { CompileOptions } from "#/compile/compile";

export const compile: typeof import("#/compile/compile").compile = async (
  ...args
) => {
  const { compile: render } = await import("#compiler-runtime");
  return render(...args);
};
