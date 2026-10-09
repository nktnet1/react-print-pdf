import { createRoot } from "react-dom/client";
import { compile, Tailwind } from "react-print-pdf";
import { expect, test, vi } from "vitest";

test("sibling Tailwind regions with identically named custom animations do not interfere", async () => {
  const firstStylesheet = `@theme { --animate-local: move-local 1s linear both; }
@keyframes move-local { from { transform: translateX(0px) } to { transform: translateX(10px) } }`;
  const secondStylesheet = `@theme { --animate-local: move-local 1s linear both; }
@keyframes move-local { from { transform: translateX(0px) } to { transform: translateX(100px) } }`;
  const html = await compile(
    <>
      <Tailwind preflight={false} stylesheet={firstStylesheet}>
        <div id="first" className="animate-local">
          First
        </div>
      </Tailwind>
      <Tailwind preflight={false} stylesheet={secondStylesheet}>
        <div id="second" className="animate-local">
          Second
        </div>
      </Tailwind>
    </>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = html;
    const first = host.querySelector<HTMLElement>("#first");
    const second = host.querySelector<HTMLElement>("#second");
    if (!first || !second) throw new Error("Missing animation fixtures");
    // Seek both animations to the end and freeze them so timing cannot influence the outcome.
    for (const element of [first, second]) {
      const animation = element.getAnimations()[0];
      expect(animation, `Expected animation for ${element.id}`).toBeDefined();
      animation.pause();
      animation.currentTime = 1000;
    }
    expect(getComputedStyle(first).transform).toBe("matrix(1, 0, 0, 1, 10, 0)");
    expect(getComputedStyle(second).transform).toBe(
      "matrix(1, 0, 0, 1, 100, 0)",
    );
  } finally {
    host.remove();
  }
}, 30_000);

test("independently compiled documents do not collide on animation names", async () => {
  const first = await compile(
    <Tailwind
      preflight={false}
      stylesheet={`@theme { --animate-local: local-spin 1s linear both; }
      @keyframes local-spin { to { transform: translateX(10px); } }`}
    >
      <div id="independent-first" className="animate-local">
        First
      </div>
    </Tailwind>,
  );
  const second = await compile(
    <Tailwind
      preflight={false}
      stylesheet={`@theme { --animate-local: local-spin 1s linear both; }
      @keyframes local-spin { to { transform: translateX(100px); } }`}
    >
      <div id="independent-second" className="animate-local">
        Second
      </div>
    </Tailwind>,
  );
  const host = document.createElement("div");
  document.body.append(host);
  try {
    host.innerHTML = first + second;
    for (const [selector, expected] of [
      ["#independent-first", "matrix(1, 0, 0, 1, 10, 0)"],
      ["#independent-second", "matrix(1, 0, 0, 1, 100, 0)"],
    ]) {
      const element = host.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`Missing animation fixture: ${selector}`);
      const animation = element.getAnimations()[0];
      expect(animation).toBeDefined();
      animation.pause();
      animation.currentTime = 1000;
      expect(getComputedStyle(element).transform).toBe(expected);
    }
  } finally {
    host.remove();
  }
}, 30_000);

test("mounted Tailwind regions scope keyframes as well as utility rules", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    root.render(
      <>
        <Tailwind
          preflight={false}
          stylesheet={`@theme { --animate-local: local-spin 1s linear both; }
        @keyframes local-spin { to { transform: translateX(10px); } }`}
        >
          <div id="mounted-first" className="animate-local">
            First
          </div>
        </Tailwind>
        <Tailwind
          preflight={false}
          stylesheet={`@theme { --animate-local: local-spin 1s linear both; }
        @keyframes local-spin { to { transform: translateX(100px); } }`}
        >
          <div id="mounted-second" className="animate-local">
            Second
          </div>
        </Tailwind>
      </>,
    );
    await vi.waitFor(
      () => {
        expect(host.querySelectorAll("style").length).toBe(2);
        for (const [selector, expected] of [
          ["#mounted-first", "matrix(1, 0, 0, 1, 10, 0)"],
          ["#mounted-second", "matrix(1, 0, 0, 1, 100, 0)"],
        ]) {
          const element = host.querySelector<HTMLElement>(selector);
          if (!element)
            throw new Error(`Missing animation fixture: ${selector}`);
          const animation = element.getAnimations()[0];
          expect(animation).toBeDefined();
          animation.pause();
          animation.currentTime = 1000;
          expect(getComputedStyle(element).transform).toBe(expected);
        }
      },
      { timeout: 15_000 },
    );
  } finally {
    root.unmount();
    host.remove();
  }
}, 30_000);
