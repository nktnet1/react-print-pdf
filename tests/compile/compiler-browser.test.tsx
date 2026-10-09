import { Global, jsx } from "@emotion/react";
import { useLayoutEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CSS, compile, Font, Tailwind } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const createHost = () => {
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
};

test("CSS preserves the zero specificity of :where selectors in Chromium", async () => {
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <>
        <CSS>{`
          .css-where-specificity { color: rgb(0, 0, 255); }
          :where(.css-where-specificity) { color: rgb(255, 0, 0); }
          .css-is-specificity { color: rgb(0, 0, 255); }
          :is(.css-is-specificity) { color: rgb(255, 0, 0); }
        `}</CSS>
        <p className="css-where-specificity" data-css-where>
          Lower-specificity :where should not override the class selector.
        </p>
        <p className="css-is-specificity" data-css-is>
          Equal-specificity :is should win when declared later.
        </p>
      </>,
    );

    await vi.waitFor(() => {
      const where = host.querySelector<HTMLElement>("[data-css-where]");
      const is = host.querySelector<HTMLElement>("[data-css-is]");
      expect(where).not.toBeNull();
      expect(is).not.toBeNull();
      expect(getComputedStyle(where as HTMLElement).color).toBe(
        "rgb(0, 0, 255)",
      );
      expect(getComputedStyle(is as HTMLElement).color).toBe("rgb(255, 0, 0)");
    });
    expect(host.querySelector("style")?.textContent).toContain(":where(");
  } finally {
    cleanup();
  }
});

test("CSS keeps literal less-than text while preventing closing-style injection", async () => {
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <>
        <CSS>{`.literal-less-than::before { content: "4 < 5"; }
          .literal-close-tag::before { content: "</StYlE ><b data-escaped='true'>"; }`}</CSS>
        <p className="literal-less-than" data-literal-less-than>
          Comparison
        </p>
        <p className="literal-close-tag" data-literal-close-tag>
          Closing tag
        </p>
      </>,
    );

    await vi.waitFor(() => {
      const comparison = host.querySelector<HTMLElement>(
        "[data-literal-less-than]",
      );
      const closing = host.querySelector<HTMLElement>(
        "[data-literal-close-tag]",
      );
      expect(comparison).not.toBeNull();
      expect(closing).not.toBeNull();
      expect(
        getComputedStyle(comparison as HTMLElement, "::before").content,
      ).toBe('"4 < 5"');
      expect(getComputedStyle(closing as HTMLElement, "::before").content).toBe(
        `"</StYlE ><b data-escaped='true'>"`,
      );
    });
    expect(host.querySelectorAll("style")).toHaveLength(1);
    expect(host.querySelector("[data-escaped]")).toBeNull();
  } finally {
    cleanup();
  }
});

test("compiled CSS cannot terminate a style element when parsed as HTML", async () => {
  const host = document.createElement("div");
  document.body.append(host);

  try {
    host.innerHTML = await compile(
      <>
        <CSS>{`.compiled-less-than::before { content: "4 < 5; </StYlE ><b data-injected>"; }`}</CSS>
        <p className="compiled-less-than" data-compiled-less-than>
          Server-rendered CSS
        </p>
      </>,
    );

    const element = host.querySelector<HTMLElement>(
      "[data-compiled-less-than]",
    );
    expect(element).not.toBeNull();
    expect(getComputedStyle(element as HTMLElement, "::before").content).toBe(
      '"4 < 5; </StYlE ><b data-injected>"',
    );
    expect(host.querySelector("[data-injected]")).toBeNull();
    expect(host.querySelectorAll("style")).toHaveLength(2);
  } finally {
    host.remove();
  }
});

test("Font loads a CSS URL with quotes and keeps the import intact", async () => {
  const { host, root, cleanup } = createHost();
  const url = `data:text/css,.from-font-import%7Bcolor%3Argb(17%2C34%2C51)%7D#Jane's"font`;

  try {
    root.render(
      <>
        <Font url={url} />
        <p className="from-font-import" data-font-import>
          Imported stylesheet
        </p>
      </>,
    );

    await vi.waitFor(() => {
      const element = host.querySelector<HTMLElement>("[data-font-import]");
      expect(element).not.toBeNull();
      expect(getComputedStyle(element as HTMLElement).color).toBe(
        "rgb(17, 34, 51)",
      );
    });
    const rules = host.querySelector("style")?.sheet?.cssRules;
    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.cssText).toContain("#Jane's");
  } finally {
    cleanup();
  }
});

test("Font URLs cannot inject additional CSS rules", async () => {
  const { host, root, cleanup } = createHost();
  const url = `data:text/css,.from-font-import%7Bcolor%3Argb(17%2C34%2C51)%7D'); .font-injected { color: rgb(255, 0, 0) } /*`;

  try {
    root.render(
      <>
        <Font url={url} />
        <p className="from-font-import" data-font-import>
          Expected import
        </p>
        <p className="font-injected" data-font-injected>
          Should not receive injected styles
        </p>
      </>,
    );

    await vi.waitFor(() => {
      const element = host.querySelector<HTMLElement>("[data-font-import]");
      expect(element).not.toBeNull();
      expect(getComputedStyle(element as HTMLElement).color).toBe(
        "rgb(17, 34, 51)",
      );
    });

    const rules = host.querySelector("style")?.sheet?.cssRules;
    expect(rules).toHaveLength(1);
    expect(rules?.[0]).toBeInstanceOf(CSSImportRule);
    const injected = host.querySelector<HTMLElement>("[data-font-injected]");
    expect(injected).not.toBeNull();
    expect(getComputedStyle(injected as HTMLElement).color).not.toBe(
      "rgb(255, 0, 0)",
    );
  } finally {
    cleanup();
  }
});

test("Tailwind generates and applies utility CSS when mounted directly in a browser", async () => {
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <Tailwind
        preflight={false}
        stylesheet="@theme { --color-direct: #123456; }"
      >
        <p data-direct-style className="bg-direct p-4">
          Direct browser render
        </p>
      </Tailwind>,
    );

    await vi.waitFor(
      () => {
        const element = host.querySelector<HTMLElement>("[data-direct-style]");
        if (!element) {
          throw new Error("Expected the Tailwind fixture to mount");
        }
        expect(getComputedStyle(element).backgroundColor).toBe(
          "rgb(18, 52, 86)",
        );
        expect(getComputedStyle(element).paddingTop).toBe("16px");
      },
      { timeout: 15_000 },
    );

    const styles = Array.from(
      host.querySelectorAll("style"),
      (style) => style.textContent ?? "",
    ).join("\n");
    expect(styles).toContain(".bg-direct");
    expect(host.innerHTML).not.toContain("data-react-print-tailwind-");
  } finally {
    cleanup();
  }
}, 30_000);

test("direct Tailwind rendering replaces its stylesheet when configuration changes", async () => {
  const { host, root, cleanup } = createHost();
  const renderTheme = (color: string) =>
    root.render(
      <Tailwind
        preflight={false}
        stylesheet={`@theme { --color-changing: ${color}; }`}
      >
        <p data-changing-style className="bg-changing">
          Reconfigured
        </p>
      </Tailwind>,
    );
  const background = () => {
    const element = host.querySelector<HTMLElement>("[data-changing-style]");
    return element ? getComputedStyle(element).backgroundColor : null;
  };

  try {
    renderTheme("#123456");
    await vi.waitFor(() => expect(background()).toBe("rgb(18, 52, 86)"), {
      timeout: 15_000,
    });

    renderTheme("#abcdef");
    await vi.waitFor(() => expect(background()).toBe("rgb(171, 205, 239)"), {
      timeout: 15_000,
    });

    expect(host.querySelectorAll("style")).toHaveLength(1);
  } finally {
    cleanup();
  }

  expect(host.querySelectorAll("style")).toHaveLength(0);
}, 30_000);

test("browser Emotion compilation emits usable CSS without leaking styles into the app", async () => {
  const originalEmotionStyleCount = document.head.querySelectorAll(
    "style[data-emotion]",
  ).length;
  const html = await compile(
    jsx(
      "div",
      {
        css: { color: "#193a5b", padding: "7px" },
        "data-emotion-browser": "true",
      },
      "Browser Emotion styles",
    ),
    { emotion: true },
  );

  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);

  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);

  try {
    const element = host.querySelector<HTMLElement>("[data-emotion-browser]");
    if (!element) {
      throw new Error("Expected the compiled Emotion fixture in the DOM");
    }
    expect(getComputedStyle(element).color).toBe("rgb(25, 58, 91)");
    expect(getComputedStyle(element).paddingTop).toBe("7px");
    expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+\s*\{[^}]*color:/);
    expect(document.head.querySelectorAll("style[data-emotion]")).toHaveLength(
      originalEmotionStyleCount,
    );
  } finally {
    host.remove();
  }
}, 30_000);

test("browser Emotion compilation preserves Global rules without leaking them", async () => {
  const originalEmotionStyleCount = document.head.querySelectorAll(
    "style[data-emotion]",
  ).length;
  const html = await compile(
    <>
      <Global styles={{ "[data-print-global]": { color: "#315779" } }} />
      <p data-print-global>Global Emotion style</p>
    </>,
    { emotion: true },
  );

  expect(html).toContain("#315779");
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);

  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  try {
    const element = host.querySelector<HTMLElement>("[data-print-global]");
    if (!element) {
      throw new Error("Expected the global Emotion fixture in the DOM");
    }
    expect(getComputedStyle(element).color).toBe("rgb(49, 87, 121)");
    expect(document.head.querySelectorAll("style[data-emotion]")).toHaveLength(
      originalEmotionStyleCount,
    );
  } finally {
    host.remove();
  }
}, 30_000);

test("browser Emotion compilation also resolves Tailwind render markers", async () => {
  const html = await compile(
    <Tailwind
      preflight={false}
      stylesheet="@theme { --color-emotion-mixed: #124578; }"
    >
      {jsx(
        "p",
        { className: "bg-emotion-mixed", css: { color: "#547698" } },
        "Browser mixed styles",
      )}
    </Tailwind>,
    { emotion: true },
  );

  expect(html).toContain("Browser mixed styles");
  expect(html).toMatch(/\.bg-emotion-mixed\s*\{[^}]*background-color:/);
  expect(html).toContain("#124578");
  expect(html).toContain("#547698");
  expect(html).not.toContain("data-react-print-tailwind-");
}, 30_000);

test("concurrent browser Emotion compilations keep their styles separate", async () => {
  const colors = ["#13579b", "#2468ac"];
  const results = await Promise.all(
    colors.map((color) =>
      compile(jsx("div", { css: { color } }, "Isolated Emotion"), {
        emotion: true,
      }),
    ),
  );

  for (const [index, html] of results.entries()) {
    expect(html).toContain("Isolated Emotion");
    expect(html).toContain(colors[index]);
    expect(html).not.toContain(colors[1 - index]);
    expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
  }
}, 30_000);

test("browser Emotion compilation cleans up after a render failure", async () => {
  const originalEmotionStyleCount = document.head.querySelectorAll(
    "style[data-emotion]",
  ).length;
  const reactErrorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const Broken = () => {
    throw new Error("cannot render print component");
  };

  try {
    await expect(compile(<Broken />, { emotion: true })).rejects.toThrow(
      "cannot render print component",
    );
  } finally {
    reactErrorLog.mockRestore();
  }

  expect(document.head.querySelectorAll("style[data-emotion]")).toHaveLength(
    originalEmotionStyleCount,
  );
  const html = await compile(<p>Can still compile</p>, { emotion: true });
  expect(html).toContain("Can still compile");
});

test("browser Emotion compilation rejects uncaught layout effect failures", async () => {
  const BrokenEffect = () => {
    useLayoutEffect(() => {
      throw new Error("cannot mount print effect");
    }, []);
    return <p>Should not print</p>;
  };

  await expect(compile(<BrokenEffect />, { emotion: true })).rejects.toThrow(
    "cannot mount print effect",
  );

  const html = await compile(<p>Follow-up render</p>, { emotion: true });
  expect(html).toContain("Follow-up render");
});

test("browser Emotion compilation unmounts detached React effects before returning", async () => {
  const events: string[] = [];
  const Tracked = () => {
    useLayoutEffect(() => {
      events.push("mounted");
      return () => {
        events.push("unmounted");
      };
    }, []);

    return <p data-detached-render>Detached React root</p>;
  };

  const html = await compile(<Tracked />, { emotion: true });

  expect(html).toContain('data-detached-render="true"');
  expect(html).toContain("Detached React root");
  expect(events).toEqual(["mounted", "unmounted"]);
});

test("direct Tailwind applies utilities introduced by an internal child state update", async () => {
  const StatefulChild = () => {
    const [updated, setUpdated] = useState(false);
    return (
      <button
        type="button"
        data-dynamic-tailwind
        className={updated ? "bg-after-state" : "bg-before-state"}
        onClick={() => setUpdated(true)}
      >
        Change background
      </button>
    );
  };
  const { host, root, cleanup } = createHost();

  try {
    root.render(
      <Tailwind
        preflight={false}
        stylesheet={`@theme {
  --color-before-state: #aa0011;
  --color-after-state: #1122aa;
}`}
      >
        <StatefulChild />
      </Tailwind>,
    );
    await vi.waitFor(
      () => {
        const button = host.querySelector<HTMLElement>(
          "[data-dynamic-tailwind]",
        );
        expect(button).not.toBeNull();
        expect(getComputedStyle(button as HTMLElement).backgroundColor).toBe(
          "rgb(170, 0, 17)",
        );
      },
      { timeout: 15_000 },
    );

    host.querySelector<HTMLButtonElement>("[data-dynamic-tailwind]")?.click();
    await vi.waitFor(
      () => {
        const button = host.querySelector<HTMLElement>(
          "[data-dynamic-tailwind]",
        );
        expect(button).not.toBeNull();
        expect(getComputedStyle(button as HTMLElement).backgroundColor).toBe(
          "rgb(17, 34, 170)",
        );
      },
      { timeout: 15_000 },
    );
  } finally {
    cleanup();
  }
}, 30_000);
