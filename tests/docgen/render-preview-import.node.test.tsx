import { expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ packageCssReads: 0 }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if (String(args[0]).endsWith("/dist/index.css")) {
        state.packageCssReads++;
        throw new Error(
          "A documentation import must not read built package CSS",
        );
      }
      return actual.readFileSync(...args);
    },
  };
});

test("documentation modules import without compiled package CSS", async () => {
  const { baseCss, renderPreview } = await import("../../docgen/renderPreview");
  const { buildFileMarkdown } = await import("../../docgen/buildFileMarkdown");

  expect(baseCss.toString()).toContain("@page");
  expect(renderPreview).toBeTypeOf("function");
  expect(buildFileMarkdown).toBeTypeOf("function");
  expect(state.packageCssReads).toBe(0);
});
