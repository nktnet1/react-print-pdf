import { expect, test, vi } from "vitest";
import { observeTailwindRegion } from "#/tailwind/tailwind";

test("watches mounted Tailwind boundary siblings and descendants", () => {
  const parent = {} as NonNullable<HTMLTemplateElement["parentNode"]>;
  const observer = { observe: vi.fn() };

  observeTailwindRegion(observer, { parentNode: parent });

  expect(observer.observe).toHaveBeenCalledExactlyOnceWith(parent, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
});

test.each([null, { parentNode: null }])(
  "does not observe Tailwind regions without a mounted parent (%#)",
  (startMarker) => {
    const observer = { observe: vi.fn() };

    observeTailwindRegion(observer, startMarker);

    expect(observer.observe).not.toHaveBeenCalled();
  },
);
