import { Global, jsx } from "@emotion/react";
import { createRoot } from "react-dom/client";
import { compile, Tailwind } from "react-print-pdf";
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
