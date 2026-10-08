import { jsx } from "@emotion/react";
import { compile } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const nonStringCacheMarkers = vi.hoisted(() => ({ count: 0 }));

vi.mock("@emotion/cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@emotion/cache")>();
  return {
    ...actual,
    default: (options: Parameters<typeof actual.default>[0]) => {
      const cache = actual.default(options);
      if (options.key === "react-print-pdf") {
        // An already-inserted rule can be represented by a boolean marker.
        cache.inserted["previously-inserted"] = true;
        nonStringCacheMarkers.count++;
      }
      return cache;
    },
  };
});

test("server Emotion compilation ignores non-CSS cache markers", async () => {
  const html = await compile(
    jsx("p", { css: { color: "#245678" } }, "Cached Emotion marker"),
    { emotion: true },
  );

  expect(nonStringCacheMarkers.count).toBeGreaterThan(0);
  expect(html).toContain("Cached Emotion marker");
  expect(html).toContain("#245678");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).not.toMatch(/<style>[^<]*\btrue\b/);
});
