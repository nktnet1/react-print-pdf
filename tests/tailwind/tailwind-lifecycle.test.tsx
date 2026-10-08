import { Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tailwind } from "react-print-pdf";
import { beforeEach, expect, test, vi } from "vitest";

type StubCompiler = { build: (candidates: string[]) => string };

const { compileTailwind } = vi.hoisted(() => ({
  compileTailwind: vi.fn<(...args: unknown[]) => Promise<StubCompiler>>(),
}));

vi.mock("tailwindcss", () => ({ compile: compileTailwind }));

const compilerWithCss = (css: string): StubCompiler => ({ build: () => css });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: unknown }
> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error !== null) {
      return (
        <p data-tailwind-error data-is-error={error instanceof Error}>
          {error instanceof Error ? error.message : String(error)}
        </p>
      );
    }

    return this.props.children;
  }
}

function createHost() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  return {
    host,
    root,
    cleanup() {
      root.unmount();
      host.remove();
    },
  };
}

function renderTheme(root: Root, color: string) {
  root.render(
    <ErrorBoundary>
      <Tailwind
        preflight={false}
        stylesheet={`@theme { --color-current: ${color}; }`}
      >
        <p className="bg-current">Direct Tailwind render</p>
      </Tailwind>
    </ErrorBoundary>,
  );
}

beforeEach(() => compileTailwind.mockReset());

test.each(["resolve", "reject"] as const)(
  "ignores obsolete Tailwind compilation when it would %s after a theme change",
  async (outcome) => {
    const first = deferred<StubCompiler>();
    const second = deferred<StubCompiler>();
    compileTailwind
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { host, root, cleanup } = createHost();

    try {
      renderTheme(root, "#112233");
      await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(1));

      renderTheme(root, "#445566");
      await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(2));
      expect(compileTailwind.mock.calls[0]?.[0]).toContain("#112233");
      expect(compileTailwind.mock.calls[1]?.[0]).toContain("#445566");

      second.resolve(compilerWithCss(".bg-current { color: #445566; }"));
      await vi.waitFor(() => {
        expect(host.querySelector("style")?.textContent).toContain("#445566");
      });

      if (outcome === "resolve") {
        first.resolve(compilerWithCss(".bg-current { color: #112233; }"));
      } else {
        first.reject(new Error("Obsolete Tailwind build failed"));
      }

      // Let the obsolete promise, PostCSS processing, and effect handlers settle.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(host.querySelector("style")?.textContent).toContain("#445566");
      expect(host.querySelector("style")?.textContent).not.toContain("#112233");
      expect(host.querySelector("[data-tailwind-error]")).toBeNull();
    } finally {
      cleanup();
    }
  },
  15_000,
);

test("converts non-Error Tailwind rejections into Errors for the boundary", async () => {
  compileTailwind.mockRejectedValueOnce("Tailwind compiler unavailable");
  const { host, root, cleanup } = createHost();
  const reactErrorLog = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    renderTheme(root, "#abcdef");
    await vi.waitFor(() => {
      const error = host.querySelector("[data-tailwind-error]");
      expect(error?.textContent).toBe("Tailwind compiler unavailable");
      expect(error?.getAttribute("data-is-error")).toBe("true");
    });
  } finally {
    cleanup();
    reactErrorLog.mockRestore();
  }
});
