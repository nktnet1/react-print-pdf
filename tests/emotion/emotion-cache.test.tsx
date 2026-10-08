import { jsx } from "@emotion/react";
import { compile } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const nullTextStyles = vi.hoisted(() => ({ count: 0 }));

vi.mock("@emotion/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@emotion/cache")>();
  return {
    ...actual,
    default: (options: Parameters<typeof actual.default>[0]) => {
      const cache = actual.default(options);
      if (options.key === "react-print-pdf" && options.container) {
        // A detached style element can report null textContent. The compiler
        // must treat it as empty CSS without discarding other Emotion rules.
        const emptyStyle = document.createElement("style");
        emptyStyle.setAttribute("data-emotion", "missing-content");
        Object.defineProperty(emptyStyle, "textContent", {
          configurable: true,
          get: () => null,
        });
        options.container.appendChild(emptyStyle);
        nullTextStyles.count++;
      }
      return cache;
    },
  };
});

test("browser Emotion compilation treats null style text as empty CSS", async () => {
  const html = await compile(
    jsx("p", { css: { color: "#1a3b5c" } }, "Nullable style content"),
    { emotion: true },
  );

  expect(nullTextStyles.count).toBeGreaterThan(0);
  expect(html).toContain("Nullable style content");
  expect(html).toContain("#1a3b5c");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
});
