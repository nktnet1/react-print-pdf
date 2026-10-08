import { compile } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const renderer = vi.hoisted(() => ({ createRootCalls: 0 }));

// Browser Mode must be able to resolve the mock module successfully. Throwing
// from the factory itself causes an unhandled Playwright route rejection.
vi.mock("react-dom/client", () => ({
  createRoot: () => {
    renderer.createRootCalls++;
    throw new Error("Cannot create a detached React root");
  },
}));

test("browser Emotion compilation rejects if its detached root cannot be created", async () => {
  const existingEmotionStyles = document.head.querySelectorAll(
    "style[data-emotion]",
  ).length;

  await expect(
    compile(<p>Requires the browser renderer</p>, { emotion: true }),
  ).rejects.toThrow("Cannot create a detached React root");

  expect(renderer.createRootCalls).toBe(1);
  expect(document.head.querySelectorAll("style[data-emotion]")).toHaveLength(
    existingEmotionStyles,
  );

  // Compiling without Emotion must not require the browser-only renderer.
  const html = await compile(<p>Server-renderable content</p>);
  expect(html).toContain("Server-renderable content");
});
