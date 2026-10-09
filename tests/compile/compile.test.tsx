import { compile, Tailwind } from "react-print-pdf";
import { compile as compileClient } from "react-print-pdf/client";
import { expect, test } from "vitest";

test("loads in frontend app", async () => {
  expect(compile).toBeDefined();
});

test("works in frontend app", async () => {
  const TestComponent = () => <div>Test</div>;

  const html = await compile(<TestComponent />);

  expect(html).toContain("Test");
});

test("client entrypoint compiles in Vite without ReactDOMServer namespace interop", async () => {
  const node = <div data-browser-render="true">Vite browser render</div>;
  const [rootHtml, clientHtml] = await Promise.all([
    compile(node),
    compileClient(node),
  ]);

  for (const html of [rootHtml, clientHtml]) {
    expect(html).toContain('data-browser-render="true"');
    expect(html).toContain("Vite browser render");
  }
});

test("works with tailwind", async () => {
  const TestComponent = () => (
    <Tailwind>
      <div className="bg-red-500">Test</div>
    </Tailwind>
  );

  const html = await compile(<TestComponent />);

  expect(html).toContain(".bg-red-500");
  expect(html).toContain("background-color");
});

test("deduplicates Tailwind utilities across repeated elements", async () => {
  // Keep this a deterministic regression test, not a million-element
  // performance benchmark that times out on shared CI runners.
  const elementCount = 10_000;
  const TestComponent = () => {
    return (
      <Tailwind>
        {Array.from({ length: elementCount }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static test content with no list reordering.
          <div key={i} className="bg-red-500">
            Test
          </div>
        ))}
      </Tailwind>
    );
  };

  const html = await compile(<TestComponent />);

  expect(html).toContain(".bg-red-500");
  expect(html.match(/class="bg-red-500"/g)).toHaveLength(elementCount);
  expect(html.match(/\.bg-red-500\s*\{/g)).toHaveLength(1);
});

test("works with tailwind dark", async () => {
  const TestComponent = () => (
    <Tailwind
      config={{
        darkMode: "class",
      }}
    >
      <div className="dark:bg-red-500">Test</div>
    </Tailwind>
  );

  const html = await compile(<TestComponent />);

  expect(html).toContain("dark\\:bg-red-500");
});

test("supports Tailwind v4 CSS-first configuration", async () => {
  const TestComponent = () => (
    <Tailwind
      stylesheet={`@theme {
  --color-brand: #6484cf;
}`}
    >
      <div className="bg-brand">Test</div>
    </Tailwind>
  );

  const html = await compile(<TestComponent />);

  expect(html).toContain(".bg-brand");
  expect(html).toContain("#6484cf");
});

test("can disable Tailwind Preflight", async () => {
  const withPreflight = await compile(
    <Tailwind>
      <div className="font-bold">Test</div>
    </Tailwind>,
  );
  const withoutPreflight = await compile(
    <Tailwind preflight={false}>
      <div className="font-bold">Test</div>
    </Tailwind>,
  );

  const legacyWithoutPreflight = await compile(
    <Tailwind config={{ corePlugins: { preflight: false } }}>
      <div className="font-bold">Test</div>
    </Tailwind>,
  );

  expect(withPreflight).toContain("box-sizing");
  expect(withoutPreflight).not.toContain("box-sizing");
  expect(withoutPreflight).toContain(".font-bold");
  expect(legacyWithoutPreflight).not.toContain("box-sizing");
  expect(legacyWithoutPreflight).toContain(".font-bold");
});

test("supports nested Tailwind regions", async () => {
  const html = await compile(
    <Tailwind>
      <div className="bg-red-500">
        <Tailwind>
          <span className="text-blue-500">Nested</span>
        </Tailwind>
      </div>
    </Tailwind>,
  );

  expect(html).toContain(".bg-red-500");
  expect(html).toContain(".text-blue-500");
  expect(
    html.match(/<template data-react-print-tailwind-start=/g),
  ).toHaveLength(2);
  expect(html.match(/<template data-react-print-tailwind-end=/g)).toHaveLength(
    2,
  );
});

test("preserves Tailwind flex gap and justify-evenly layout in Chromium", async () => {
  const html = await compile(
    <Tailwind>
      <div data-layout="evenly" className="flex w-[400px] justify-evenly">
        <div className="h-[10px] w-[40px]" />
        <div className="h-[10px] w-[40px]" />
        <div className="h-[10px] w-[40px]" />
      </div>
      <div data-layout="gap-x" className="flex gap-x-[20px]">
        <div className="h-[10px] w-[30px]" />
        <div className="h-[10px] w-[30px]" />
      </div>
      <div data-layout="gap-y" className="flex flex-col gap-y-[12px]">
        <div className="h-[10px] w-[30px]" />
        <div className="h-[10px] w-[30px]" />
      </div>
      <div
        data-layout="gap-wrap"
        className="flex w-[95px] flex-wrap gap-x-[10px] gap-y-[12px]"
      >
        <div className="h-[10px] w-[40px]" />
        <div className="h-[10px] w-[40px]" />
        <div className="h-[10px] w-[40px]" />
      </div>
    </Tailwind>,
  );

  expect(html).toMatch(/justify-content:\s*space-evenly/);
  expect(html).toMatch(/column-gap:\s*20px/);
  expect(html).toMatch(/row-gap:\s*12px/);

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.innerHTML = html;
  document.body.append(host);

  try {
    const evenly = host.querySelector<HTMLElement>('[data-layout="evenly"]');
    const gapX = host.querySelector<HTMLElement>('[data-layout="gap-x"]');
    const gapY = host.querySelector<HTMLElement>('[data-layout="gap-y"]');
    const gapWrap = host.querySelector<HTMLElement>('[data-layout="gap-wrap"]');

    expect(evenly).not.toBeNull();
    expect(gapX).not.toBeNull();
    expect(gapY).not.toBeNull();
    expect(gapWrap).not.toBeNull();

    if (!evenly || !gapX || !gapY || !gapWrap) {
      throw new Error("Expected flex layout fixtures to render.");
    }

    const evenlyChildren = Array.from(evenly.children, (child) =>
      (child as HTMLElement).getBoundingClientRect(),
    );
    const evenlyRect = evenly.getBoundingClientRect();
    const evenlySpaces = [
      evenlyChildren[0].left - evenlyRect.left,
      evenlyChildren[1].left - evenlyChildren[0].right,
      evenlyChildren[2].left - evenlyChildren[1].right,
      evenlyRect.right - evenlyChildren[2].right,
    ];

    for (const space of evenlySpaces) {
      expect(space).toBeCloseTo(70, 1);
    }

    const gapXChildren = Array.from(gapX.children, (child) =>
      (child as HTMLElement).getBoundingClientRect(),
    );
    expect(gapXChildren[1].left - gapXChildren[0].right).toBeCloseTo(20, 1);

    const gapYChildren = Array.from(gapY.children, (child) =>
      (child as HTMLElement).getBoundingClientRect(),
    );
    expect(gapYChildren[1].top - gapYChildren[0].bottom).toBeCloseTo(12, 1);

    const gapWrapChildren = Array.from(gapWrap.children, (child) =>
      (child as HTMLElement).getBoundingClientRect(),
    );
    expect(gapWrapChildren[1].left - gapWrapChildren[0].right).toBeCloseTo(
      10,
      1,
    );
    expect(gapWrapChildren[2].top - gapWrapChildren[0].bottom).toBeCloseTo(
      12,
      1,
    );
  } finally {
    host.remove();
  }
});
