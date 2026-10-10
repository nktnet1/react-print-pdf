import { afterEach, expect, test, vi } from "vitest";
import { compile } from "#/compile/compile";
import { Tailwind } from "#/tailwind/tailwind";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("compiles ordinary and Emotion documents without global Web Crypto", async () => {
  vi.stubGlobal("crypto", undefined);
  for (const options of [undefined, { emotion: true }]) {
    const html = await compile(<main>Simple document</main>, options);
    expect(html).toContain("Simple document");
    expect(html).toContain("<style>");
  }
});

test("keeps Tailwind IDs distinct without Web Crypto, even with deterministic randomness", async () => {
  vi.stubGlobal("crypto", undefined);
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.spyOn(Date, "now").mockReturnValue(1000);
  const first = await compile(
    <Tailwind stylesheet={"@theme { --color-custom: #123456; }"}>
      <p className="text-custom">First</p>
    </Tailwind>,
  );
  const second = await compile(
    <Tailwind stylesheet={"@theme { --color-custom: #654321; }"}>
      <p className="text-custom">Second</p>
    </Tailwind>,
  );
  const marker = /data-react-print-tailwind-start="([^"]+)"/;
  const firstId = first.match(marker)?.[1];
  const secondId = second.match(marker)?.[1];
  expect(firstId).toMatch(/^react-print-tailwind-/);
  expect(secondId).toMatch(/^react-print-tailwind-/);
  expect(firstId).not.toBe(secondId);
  expect(first).toContain("#123456");
  expect(second).toContain("#654321");
});

test("falls back when crypto exists without getRandomValues", async () => {
  vi.stubGlobal("crypto", {});
  const html = await compile(<p>No getRandomValues method</p>);
  expect(html).toContain("No getRandomValues method");
});

test("continues using Web Crypto when it is available", async () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.fill(0xab);
    return bytes;
  });
  vi.stubGlobal("crypto", { getRandomValues });
  const html = await compile(
    <Tailwind preflight={false}>
      <p className="font-bold">Web Crypto</p>
    </Tailwind>,
  );
  expect(getRandomValues).toHaveBeenCalledOnce();
  expect(html).toContain(
    "react-print-tailwind-abababababababababababababababab-0",
  );
});
