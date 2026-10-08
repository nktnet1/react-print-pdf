import { jsx } from "@emotion/react";
import { compile } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const observed = vi.hoisted(() => ({
  cacheOptions: [] as Array<{
    key: string;
    container?: Node;
    speedy?: boolean;
  }>,
  renderCount: 0,
  unmountCount: 0,
}));

vi.mock("@emotion/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@emotion/cache")>();
  return {
    ...actual,
    default: (options: Parameters<typeof actual.default>[0]) => {
      if (options.key === "react-print-pdf") {
        observed.cacheOptions.push(options);
      }
      return actual.default(options);
    },
  };
});

vi.mock("react-dom/client", () => ({
  createRoot: (host: { innerHTML: string }) => ({
    render: () => {
      observed.renderCount++;
      host.innerHTML = "<p data-detached-root>Detached root</p>";
    },
    unmount: () => {
      observed.unmountCount++;
    },
  }),
}));

test("Emotion configures its cache for both server and detached browser roots", async () => {
  // Exercise both modes in one Node coverage process rather than relying on
  // cross-project merging of browser and server V8 branch ranges.
  const serverHtml = await compile(
    jsx("p", { css: { color: "#123456" } }, "Server cache"),
    { emotion: true },
  );

  expect(serverHtml).toContain("Server cache");
  expect(serverHtml).toContain("#123456");
  expect(observed.cacheOptions[0]).toMatchObject({ key: "react-print-pdf" });
  expect(observed.cacheOptions[0]?.container).toBeUndefined();
  expect(observed.cacheOptions[0]?.speedy).toBeUndefined();

  const elements: Array<{
    innerHTML: string;
    querySelectorAll: (selector: string) => HTMLStyleElement[];
  }> = [];

  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      expect(tagName).toBe("div");
      const element = {
        innerHTML: "",
        querySelectorAll: (selector: string) => {
          expect(selector).toBe("style[data-emotion]");
          return [];
        },
      };
      elements.push(element);
      return element;
    },
  });

  try {
    const browserHtml = await compile(<p>Browser cache</p>, { emotion: true });

    expect(browserHtml).toContain("Detached root");
    expect(observed.cacheOptions[1]).toMatchObject({
      key: "react-print-pdf",
      container: elements[0],
      speedy: false,
    });
    expect(observed.renderCount).toBe(1);
    expect(observed.unmountCount).toBe(1);
    expect(elements).toHaveLength(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
