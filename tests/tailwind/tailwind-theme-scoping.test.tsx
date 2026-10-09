import { createRoot } from "react-dom/client";
import { compile, Tailwind } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const backgroundOf = (host: ParentNode, selector: string) => {
  const element = host.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing fixture: ${selector}`);
  return getComputedStyle(element).backgroundColor;
};

test("compiled sibling Tailwind themes and utilities stay within their own regions", async () => {
  const html = await compile(
    <>
      <Tailwind
        preflight={false}
        stylesheet="@theme { --color-shared: #123456; }"
      >
        <p data-region="first" className="bg-shared">
          First
        </p>
        <section>
          <span data-region="descendant" className="bg-shared">
            Descendant
          </span>
        </section>
      </Tailwind>
      <Tailwind
        preflight={false}
        stylesheet="@theme { --color-shared: #654321; }"
      >
        <p data-region="second" className="bg-shared">
          Second
        </p>
      </Tailwind>
      <p data-region="outside" className="bg-shared">
        Outside
      </p>
    </>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    expect(backgroundOf(host, '[data-region="first"]')).toBe("rgb(18, 52, 86)");
    expect(backgroundOf(host, '[data-region="descendant"]')).toBe(
      "rgb(18, 52, 86)",
    );
    expect(backgroundOf(host, '[data-region="second"]')).toBe(
      "rgb(101, 67, 33)",
    );
    expect(backgroundOf(host, '[data-region="outside"]')).not.toBe(
      "rgb(101, 67, 33)",
    );
  } finally {
    host.remove();
  }
});

test("nested Tailwind themes override the parent only inside their region", async () => {
  const html = await compile(
    <Tailwind
      preflight={false}
      stylesheet="@theme { --color-shared: #123456; }"
    >
      <div data-region="outer" className="bg-shared">
        <Tailwind
          preflight={false}
          stylesheet="@theme { --color-shared: #654321; }"
        >
          <span data-region="inner" className="bg-shared">
            Inner
          </span>
        </Tailwind>
        <span data-region="outer-after" className="bg-shared">
          Outer again
        </span>
      </div>
    </Tailwind>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    expect(backgroundOf(host, '[data-region="outer"]')).toBe("rgb(18, 52, 86)");
    expect(backgroundOf(host, '[data-region="inner"]')).toBe(
      "rgb(101, 67, 33)",
    );
    expect(backgroundOf(host, '[data-region="outer-after"]')).toBe(
      "rgb(18, 52, 86)",
    );
  } finally {
    host.remove();
  }
});

test("mounted sibling Tailwind regions do not leak styles when updated", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (firstColor: string) =>
    root.render(
      <>
        <Tailwind
          preflight={false}
          stylesheet={`@theme { --color-shared: ${firstColor}; }`}
        >
          <p data-region="first" className="bg-shared">
            First
          </p>
        </Tailwind>
        <Tailwind
          preflight={false}
          stylesheet="@theme { --color-shared: #654321; }"
        >
          <p data-region="second" className="bg-shared">
            Second
          </p>
        </Tailwind>
      </>,
    );
  try {
    render("#123456");
    await vi.waitFor(
      () => {
        expect(backgroundOf(host, '[data-region="first"]')).toBe(
          "rgb(18, 52, 86)",
        );
        expect(backgroundOf(host, '[data-region="second"]')).toBe(
          "rgb(101, 67, 33)",
        );
      },
      { timeout: 15_000 },
    );
    render("#008800");
    await vi.waitFor(
      () => {
        expect(backgroundOf(host, '[data-region="first"]')).toBe(
          "rgb(0, 136, 0)",
        );
        expect(backgroundOf(host, '[data-region="second"]')).toBe(
          "rgb(101, 67, 33)",
        );
      },
      { timeout: 15_000 },
    );
  } finally {
    root.unmount();
    host.remove();
  }
}, 30_000);

test("Tailwind Preflight resets only its own region", async () => {
  const html = await compile(
    <>
      <Tailwind>
        <h2 data-reset>Preflight heading</h2>
      </Tailwind>
      <h2 data-outside-reset>Unstyled heading</h2>
    </>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    const inside = host.querySelector<HTMLElement>("[data-reset]");
    const outside = host.querySelector<HTMLElement>("[data-outside-reset]");
    if (!inside || !outside) throw new Error("Expected both headings");
    expect(getComputedStyle(inside).marginTop).toBe("0px");
    expect(
      Number.parseFloat(getComputedStyle(outside).marginTop),
    ).toBeGreaterThan(0);
  } finally {
    host.remove();
  }
});

test("Tailwind supports pseudo-elements, responsive utilities, and animation keyframes", async () => {
  const html = await compile(
    <Tailwind
      preflight={false}
      stylesheet="@theme { --color-accent: #125578; }"
    >
      <span
        data-pseudo
        className="before:content-['scoped'] before:text-accent md:text-accent animate-spin"
      >
        Pseudo
      </span>
    </Tailwind>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    const element = host.querySelector<HTMLElement>("[data-pseudo]");
    if (!element) throw new Error("Expected pseudo element");
    const before = getComputedStyle(element, "::before");
    expect(before.content).toBe('"scoped"');
    expect(before.color).toBe("rgb(18, 85, 120)");
    expect(getComputedStyle(element).animationName).toBe("spin");
  } finally {
    host.remove();
  }
});

test("Tailwind does not insert layout wrappers around table rows", async () => {
  const html = await compile(
    <table>
      <tbody>
        <Tailwind
          preflight={false}
          stylesheet="@theme { --color-cell: #123456; }"
        >
          <tr data-table-row>
            <td data-cell className="bg-cell">
              Cell
            </td>
          </tr>
        </Tailwind>
      </tbody>
    </table>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    expect(host.querySelectorAll("table > tbody > tr")).toHaveLength(1);
    expect(backgroundOf(host, "[data-cell]")).toBe("rgb(18, 52, 86)");
  } finally {
    host.remove();
  }
});
