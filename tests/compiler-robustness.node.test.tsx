import { jsx } from "@emotion/react";
import { compile, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

test("concurrent Tailwind compilations do not leak candidates or themes", async () => {
  const fixtures = [
    { name: "alpha", color: "#13579b" },
    { name: "beta", color: "#2468ac" },
    { name: "gamma", color: "#3579bd" },
  ];

  const htmlDocuments = await Promise.all(
    fixtures.map(({ name, color }) =>
      compile(
        <Tailwind
          preflight={false}
          stylesheet={`@theme { --color-${name}: ${color}; }`}
        >
          <div className={`bg-${name}`}>{name}</div>
        </Tailwind>,
      ),
    ),
  );

  for (const [index, html] of htmlDocuments.entries()) {
    const fixture = fixtures[index];
    expect(html).toContain(`.bg-${fixture.name}`);
    expect(html).toContain(fixture.color);
    expect(html).not.toContain("data-react-print-tailwind-");

    for (const other of fixtures.filter((item) => item !== fixture)) {
      expect(html).not.toContain(`.bg-${other.name}`);
      expect(html).not.toContain(other.color);
    }
  }
}, 15_000);

test("legacy theme extensions work without the default Preflight reset", async () => {
  const html = await compile(
    <Tailwind
      preflight={false}
      config={{ theme: { extend: { colors: { retro: "#526374" } } } }}
    >
      <div className="bg-retro">Legacy theme</div>
    </Tailwind>,
  );

  expect(html).toContain("Legacy theme");
  expect(html).toMatch(/\.bg-retro\s*\{[^}]*background-color:/);
  expect(html).toContain("#526374");
  expect(html).not.toContain("box-sizing");
}, 15_000);

test("CSS-first custom utilities compile alongside ordinary Tailwind classes", async () => {
  const html = await compile(
    <Tailwind
      preflight={false}
      stylesheet="@utility print-accent { outline: 2px solid #5294c6; }"
    >
      <p className="print-accent p-4">Custom utility</p>
    </Tailwind>,
  );

  expect(html).toMatch(/\.print-accent\s*\{[^}]*outline:/);
  expect(html).toContain("#5294c6");
  expect(html).toMatch(/\.p-4\s*\{[^}]*padding:/);
}, 15_000);

test("Tailwind and Emotion compile together without leaving render markers", async () => {
  const html = await compile(
    <Tailwind preflight={false} stylesheet="@theme { --color-mixed: #196482; }">
      {jsx(
        "div",
        {
          className: "bg-mixed",
          css: { borderWidth: "3px", borderStyle: "solid" },
        },
        "Combined styles",
      )}
    </Tailwind>,
    { emotion: true },
  );

  expect(html).toContain("Combined styles");
  expect(html).toMatch(/\.bg-mixed\s*\{[^}]*background-color:/);
  expect(html).toContain("#196482");
  expect(html).toMatch(/\.react-print-pdf-[a-z0-9-]+/);
  expect(html).toContain("border-width:3px");
  expect(html).not.toContain("data-react-print-tailwind-");
  expect(html).not.toMatch(/<style\b[^>]*\bdata-emotion=/);
}, 15_000);

test("unsupported Tailwind imports reject and do not poison the next compilation", async () => {
  await expect(
    compile(
      <Tailwind stylesheet='@import "./missing-print-styles.css";'>
        <p className="font-bold">Bad stylesheet</p>
      </Tailwind>,
    ),
  ).rejects.toThrow(/Unsupported Tailwind stylesheet import/);

  const html = await compile(
    <Tailwind preflight={false}>
      <p className="font-bold">Recovered</p>
    </Tailwind>,
  );
  expect(html).toMatch(/\.font-bold\s*\{[^}]*font-weight:/);
  expect(html).toContain("Recovered");
}, 15_000);

test("legacy corePlugins controls Preflight without requiring a legacy theme", async () => {
  const withoutPreflight = await compile(
    <Tailwind config={{ corePlugins: ["display"] }}>
      <div className="font-bold">No Preflight</div>
    </Tailwind>,
  );
  expect(withoutPreflight).not.toContain("box-sizing: border-box");
  expect(withoutPreflight).toMatch(/\.font-bold\s*\{[^}]*font-weight:/);

  const withPreflight = await compile(
    <Tailwind config={{ corePlugins: ["preflight"] }}>
      <div className="font-bold">With Preflight</div>
    </Tailwind>,
  );
  expect(withPreflight).toContain("box-sizing: border-box");

  const explicitlyEnabled = await compile(
    <Tailwind config={{ corePlugins: { preflight: false } }} preflight>
      <div className="font-bold">Explicit Preflight</div>
    </Tailwind>,
  );
  expect(explicitlyEnabled).toContain("box-sizing: border-box");
}, 15_000);

test("unsupported Tailwind plugins fail with an actionable error", async () => {
  await expect(
    compile(
      <Tailwind stylesheet='@plugin "./not-a-bundled-plugin.js";'>
        <p className="font-bold">Plugin</p>
      </Tailwind>,
    ),
  ).rejects.toThrow(/Unsupported Tailwind module:.*not-a-bundled-plugin/);
});

test("a manually specified virtual config cannot load without a legacy config", async () => {
  await expect(
    compile(
      <Tailwind stylesheet='@config "react-print-tailwind-config";'>
        <p className="font-bold">Missing config</p>
      </Tailwind>,
    ),
  ).rejects.toThrow(
    /Unsupported Tailwind module:.*react-print-tailwind-config/,
  );
});
