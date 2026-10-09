import { renderToString } from "react-dom/server";
import { expect, test } from "vitest";
import { createTailwindStyleCollector, Tailwind } from "#/tailwind/tailwind";

test.each([
  {
    name: "start",
    markup:
      '<style data-react-print-tailwind-end="react-print-tailwind-0"></style>',
  },
  {
    name: "end",
    markup:
      '<style data-react-print-tailwind-start="react-print-tailwind-0"></style>',
  },
])(
  "rejects Tailwind regions missing their $name marker",
  async ({ markup }) => {
    const collector = createTailwindStyleCollector();
    const id = collector.register({ preflight: false });

    await expect(collector.resolve(markup)).rejects.toThrow(
      `Unable to locate Tailwind render markers for ${id}.`,
    );
  },
);

test("a collector without Tailwind registrations leaves HTML untouched", async () => {
  const collector = createTailwindStyleCollector();
  const original = '<article class="font-bold"><p>Existing HTML</p></article>';

  expect(await collector.resolve(original)).toBe(original);
});

test("reusing a collector does not reuse candidates from previous HTML", async () => {
  const collector = createTailwindStyleCollector();
  const id = collector.register({ preflight: false });
  const wrap = (className: string) =>
    `<style data-react-print-tailwind-start="${id}"></style><span class="${className}">Content</span><style data-react-print-tailwind-end="${id}"></style>`;

  const first = await collector.resolve(wrap("text-[#123456]"));
  const second = await collector.resolve(wrap("text-[#654321]"));

  expect(first).toContain("#123456");
  expect(first).not.toContain("#654321");
  expect(second).toContain("#654321");
  expect(second).not.toContain("#123456");
  expect(first).not.toContain("data-react-print-tailwind-");
  expect(second).not.toContain("data-react-print-tailwind-");
});

test("standalone Tailwind does not nest server rendering inside its hooks", () => {
  const html = renderToString(
    <Tailwind>
      <p className="text-lg">Standalone Tailwind example</p>
    </Tailwind>,
  );

  expect(html).toContain("Standalone Tailwind example");
  expect(html).toContain('class="text-lg"');
});
