import { compile } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const plugins = vi.hoisted(() => ({ cssVariablesCalls: 0 }));

// Keep the import resolvable so a plugin initialization failure is reported by
// compile(), not by Vitest's module-mocking infrastructure.
vi.mock("postcss-css-variables", () => ({
  default: () => {
    plugins.cssVariablesCalls++;
    throw new Error("CSS variables postprocessor failed to initialize");
  },
}));

test("server Emotion compilation propagates CSS postprocessor initialization errors", async () => {
  await expect(
    compile(<p>Requires CSS postprocessing</p>, { emotion: true }),
  ).rejects.toThrow("CSS variables postprocessor failed to initialize");

  expect(plugins.cssVariablesCalls).toBe(1);

  // The ordinary compiler path does not import Emotion-only CSS processors.
  const html = await compile(<p>Without CSS postprocessing</p>);
  expect(html).toContain("Without CSS postprocessing");
});
