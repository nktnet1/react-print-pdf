import { expect, test } from "vitest";
import { createTailwindStyleCollector } from "#/tailwind/tailwind";

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
