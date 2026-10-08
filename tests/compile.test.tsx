import { compile, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

test("loads in frontend app", async () => {
  expect(compile).toBeDefined();
});

test("works in frontend app", async () => {
  const TestComponent = () => <div>Test</div>;

  const html = await compile(<TestComponent />);

  expect(html).toContain("Test");
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

test("smoke test tailwind", async () => {
  const TestComponent = () => {
    return (
      <Tailwind>
        {Array.from({ length: 1000000 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static server-render stress test with no list reordering.
          <div key={i} className="bg-red-500">
            Test
          </div>
        ))}
      </Tailwind>
    );
  };

  const html = await compile(<TestComponent />);

  expect(html).toContain(".bg-red-500");
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
  expect(html).not.toContain("data-react-print-tailwind-");
});
