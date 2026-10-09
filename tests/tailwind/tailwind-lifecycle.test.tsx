import {
  Component,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { Tailwind } from "react-print-pdf";
import { beforeEach, expect, test, vi } from "vitest";
import { extractMountedClassNames } from "#/tailwind/tailwind";

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

test("mounted Tailwind class discovery stays inside its boundaries", () => {
  const host = document.createElement("div");
  const start = document.createElement("template");
  const end = document.createElement("template");
  const section = document.createElement("section");
  section.className = "bg-inside p-4";
  const nested = document.createElement("span");
  nested.className = "p-4 font-bold";
  section.append(nested);
  const outside = document.createElement("p");
  outside.className = "bg-outside";
  host.append(
    start,
    document.createTextNode("separator"),
    section,
    end,
    outside,
  );

  expect(extractMountedClassNames(start, end)).toEqual([
    "bg-inside",
    "p-4",
    "font-bold",
  ]);
});

test.each(["start", "end"] as const)(
  "mounted Tailwind class discovery rejects a missing %s boundary ref",
  (missing) => {
    const start = document.createElement("template");
    const end = document.createElement("template");
    expect(() =>
      extractMountedClassNames(
        missing === "start" ? null : start,
        missing === "end" ? null : end,
      ),
    ).toThrow("Unable to locate direct Tailwind render boundaries.");
  },
);

test("mounted Tailwind class discovery rejects an end marker outside the region", () => {
  const host = document.createElement("div");
  const start = document.createElement("template");
  const end = document.createElement("template");
  host.append(start, document.createElement("p"));

  expect(() => extractMountedClassNames(start, end)).toThrow(
    "Unable to locate direct Tailwind render boundaries.",
  );
});

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

test.each([
  ["Error", new Error("Mounted class inspection failed")],
  ["non-Error", "Mounted class inspection failed"],
])(
  "reports %s failures from mounted Tailwind class discovery",
  async (_kind, failure) => {
    compileTailwind.mockResolvedValue(
      compilerWithCss(".bg-initial { color: red; }"),
    );
    const { host, root, cleanup } = createHost();
    const reactErrorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    try {
      root.render(
        <ErrorBoundary>
          <Tailwind preflight={false}>
            <p className="bg-initial">Browser content</p>
          </Tailwind>
        </ErrorBoundary>,
      );
      await vi.waitFor(() => {
        expect(host.querySelector("style")?.textContent).toContain(
          ".bg-initial",
        );
      });

      const paragraph = host.querySelector("p");
      if (!paragraph) {
        throw new Error("Expected a mounted Tailwind child");
      }
      // Simulate a DOM API failure on the observer's next class scan. This
      // exercises the component error boundary, not just the class collector.
      const classScan = vi
        .spyOn(paragraph, "querySelectorAll")
        .mockImplementation(() => {
          throw failure;
        });
      try {
        paragraph.classList.add("bg-updated");
        await vi.waitFor(() => {
          const error = host.querySelector("[data-tailwind-error]");
          expect(error?.textContent).toBe("Mounted class inspection failed");
          expect(error?.getAttribute("data-is-error")).toBe("true");
        });
        expect(compileTailwind).toHaveBeenCalledTimes(1);
      } finally {
        classScan.mockRestore();
      }
    } finally {
      cleanup();
      reactErrorLog.mockRestore();
    }
  },
);

test("direct Tailwind collects classes from mounted context consumers without rendering twice", async () => {
  compileTailwind.mockResolvedValue(
    compilerWithCss(".bg-contextual { background-color: #123456; }"),
  );
  const Theme = createContext("bg-outside-context");
  let renderCount = 0;
  const ContextualContent = () => {
    renderCount++;
    const className = useContext(Theme);
    const id = useId();
    return (
      <section className={className} data-react-id={id}>
        <svg aria-label="Icon" role="img">
          <path className="fill-current" d="M 0 0 L 1 1" />
        </svg>
      </section>
    );
  };

  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <Theme.Provider value="bg-contextual">
        <Tailwind preflight={false}>
          <ContextualContent />
        </Tailwind>
      </Theme.Provider>,
    );

    await vi.waitFor(() => {
      expect(compileTailwind).toHaveBeenCalledTimes(1);
      expect(host.querySelector("style")?.textContent).toContain("#123456");
    });

    const input = String(compileTailwind.mock.calls[0]?.[0]);
    expect(input).toContain('@source inline("bg-contextual")');
    expect(input).toContain('@source inline("fill-current")');
    expect(input).not.toContain("bg-outside-context");
    expect(renderCount).toBe(1);
    expect(host.querySelector("[data-react-id]")).not.toBeNull();
  } finally {
    cleanup();
  }
});

test("direct Tailwind rebuilds for a new child class without reusing old candidates", async () => {
  compileTailwind.mockResolvedValue(compilerWithCss(""));
  const { root, cleanup } = createHost();
  const renderContent = (className: string) => {
    root.render(
      <Tailwind preflight={false}>
        <p className={className}>Changing document</p>
      </Tailwind>,
    );
  };

  try {
    renderContent("bg-old");
    await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(1));

    renderContent("bg-new");
    await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(2));
    // Neither the observer nor the parent rerender should schedule a third build.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compileTailwind).toHaveBeenCalledTimes(2);

    const firstInput = String(compileTailwind.mock.calls[0]?.[0]);
    const secondInput = String(compileTailwind.mock.calls[1]?.[0]);
    expect(firstInput).toContain('@source inline("bg-old")');
    expect(secondInput).toContain('@source inline("bg-new")');
    expect(secondInput).not.toContain('@source inline("bg-old")');
  } finally {
    cleanup();
  }
});

test("direct Tailwind does not recompile unchanged classes when its parent rerenders", async () => {
  compileTailwind.mockResolvedValue(
    compilerWithCss(".bg-static { color: red; }"),
  );
  const { host, root, cleanup } = createHost();
  const renderContent = (text: string) => {
    root.render(
      <Tailwind preflight={false}>
        <p className="bg-static">{text}</p>
      </Tailwind>,
    );
  };

  try {
    renderContent("First render");
    await vi.waitFor(() => {
      expect(host.querySelector("style")?.textContent).toContain(".bg-static");
    });
    expect(compileTailwind).toHaveBeenCalledTimes(1);

    renderContent("New text, same utility");
    await vi.waitFor(() => {
      expect(host.querySelector("p")?.textContent).toBe(
        "New text, same utility",
      );
    });
    // Let any queued DOM mutation observer callbacks run before asserting.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compileTailwind).toHaveBeenCalledTimes(1);
  } finally {
    cleanup();
  }
});

test("direct Tailwind rebuilds when child state changes a class without parent props changing", async () => {
  compileTailwind.mockImplementation(async (input: unknown) => {
    const source = String(input);
    return compilerWithCss(
      source.includes('@source inline("bg-updated")')
        ? ".bg-updated { color: blue; }"
        : ".bg-initial { color: red; }",
    );
  });

  let renderCount = 0;
  const StatefulChild = () => {
    const [updated, setUpdated] = useState(false);
    renderCount++;
    return (
      <button
        type="button"
        className={updated ? "bg-updated" : "bg-initial"}
        onClick={() => setUpdated(true)}
      >
        Change class
      </button>
    );
  };
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <Tailwind preflight={false}>
        <StatefulChild />
      </Tailwind>,
    );
    await vi.waitFor(() => {
      expect(host.querySelector("style")?.textContent).toContain(".bg-initial");
    });

    host.querySelector("button")?.click();
    await vi.waitFor(() => {
      expect(host.querySelector("style")?.textContent).toContain(".bg-updated");
      expect(host.querySelector("style")?.textContent).not.toContain(
        ".bg-initial",
      );
    });

    expect(compileTailwind).toHaveBeenCalledTimes(2);
    expect(String(compileTailwind.mock.calls[1]?.[0])).toContain(
      '@source inline("bg-updated")',
    );
    expect(renderCount).toBe(2);
  } finally {
    cleanup();
  }
});

test("direct Tailwind detects class-bearing elements added and removed by child state", async () => {
  compileTailwind.mockResolvedValue(compilerWithCss(""));
  const StatefulChild = () => {
    const [visible, setVisible] = useState(false);
    return (
      <div>
        <button type="button" onClick={() => setVisible((value) => !value)}>
          Toggle child
        </button>
        {visible && <span className="text-added">Added element</span>}
      </div>
    );
  };
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <Tailwind preflight={false}>
        <StatefulChild />
      </Tailwind>,
    );
    await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(1));

    host.querySelector("button")?.click();
    await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(2));
    expect(String(compileTailwind.mock.calls[1]?.[0])).toContain(
      '@source inline("text-added")',
    );

    host.querySelector("button")?.click();
    await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(3));
    expect(String(compileTailwind.mock.calls[2]?.[0])).not.toContain(
      '@source inline("text-added")',
    );

    // The observer watches the common parent, but candidates are scoped to
    // Tailwind's boundaries. Unrelated siblings must not cause recompilation.
    const outside = document.createElement("div");
    outside.className = "bg-outside";
    host.append(outside);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(compileTailwind).toHaveBeenCalledTimes(3);
  } finally {
    cleanup();
  }
});

test.each(["resolve", "reject"] as const)(
  "ignores obsolete child-state Tailwind compilation when it would %s",
  async (outcome) => {
    const first = deferred<StubCompiler>();
    const second = deferred<StubCompiler>();
    compileTailwind
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const StatefulChild = () => {
      const [updated, setUpdated] = useState(false);
      return (
        <button
          type="button"
          className={updated ? "bg-new" : "bg-old"}
          onClick={() => setUpdated(true)}
        >
          Change class
        </button>
      );
    };
    const { host, root, cleanup } = createHost();

    try {
      root.render(
        <ErrorBoundary>
          <Tailwind preflight={false}>
            <StatefulChild />
          </Tailwind>
        </ErrorBoundary>,
      );
      await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(1));
      host.querySelector("button")?.click();
      await vi.waitFor(() => expect(compileTailwind).toHaveBeenCalledTimes(2));
      expect(String(compileTailwind.mock.calls[1]?.[0])).toContain(
        '@source inline("bg-new")',
      );

      second.resolve(compilerWithCss(".bg-new { color: blue; }"));
      await vi.waitFor(() => {
        expect(host.querySelector("style")?.textContent).toContain(".bg-new");
      });

      if (outcome === "resolve") {
        first.resolve(compilerWithCss(".bg-old { color: red; }"));
      } else {
        first.reject(new Error("Obsolete class compilation failed"));
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(host.querySelector("style")?.textContent).toContain(".bg-new");
      expect(host.querySelector("style")?.textContent).not.toContain(".bg-old");
      expect(host.querySelector("[data-tailwind-error]")).toBeNull();
      expect(compileTailwind).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  },
);
