import postcss from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import {
  compile,
  RunningH1,
  RunningH2,
  RunningH3,
  RunningH4,
  RunningH5,
  RunningH6,
} from "react-print-pdf";
import { expect, test } from "vitest";

const runningLevels = [
  "reactPrintH1Contents",
  "reactPrintH2Contents",
  "reactPrintH3Contents",
  "reactPrintH4Contents",
  "reactPrintH5Contents",
  "reactPrintH6Contents",
];

test("each running heading resets all deeper heading levels", async () => {
  const html = await compile(
    <>
      <h1>Chapter</h1>
      <h2>Section</h2>
      <h3>Detail</h3>
    </>,
  );
  const stylesheet = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1];
  expect(stylesheet).toBeDefined();
  if (!stylesheet) throw new Error("Missing compiled stylesheet");
  const css = postcss.parse(stylesheet);

  for (let level = 1; level <= 6; level++) {
    const rule = css.nodes.find(
      (node) => node.type === "rule" && node.selector === `h${level}`,
    );
    expect(rule, `Missing h${level} string-set rule`).toBeDefined();
    if (rule?.type !== "rule") throw new Error("Missing heading rule");
    const value = rule.nodes.find(
      (node) => node.type === "decl" && node.prop === "string-set",
    );
    if (value?.type !== "decl") throw new Error("Missing string-set");
    expect(value.value).toContain(`${runningLevels[level - 1]} content(text)`);
    for (const descendant of runningLevels.slice(level)) {
      expect(value.value).toContain(`${descendant} ""`);
    }
  }
});

test("running headings combine their configured affixes with the current heading string", async () => {
  const html = await compile(
    <>
      <RunningH1 before="Chapter: " after=" (continued)" />
      <RunningH2 before="Chapter: " after=" (continued)" />
      <RunningH3 before="Chapter: " after=" (continued)" />
      <RunningH4 before="Chapter: " after=" (continued)" />
      <RunningH5 before="Chapter: " after=" (continued)" />
      <RunningH6 before="Chapter: " after=" (continued)" />
    </>,
  );
  const spans = renderToStaticMarkup(
    <RunningH1 before="Chapter: " after=" (continued)" />,
  );
  expect(spans).toContain('data-before="Chapter: "');
  expect(spans).toContain('data-after=" (continued)"');
  expect(spans).toMatch(/<span[^>]*><\/span>/);

  const stylesheet = html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1];
  expect(stylesheet).toBeDefined();
  if (!stylesheet) throw new Error("Missing compiled stylesheet");
  const css = postcss.parse(stylesheet);
  for (let level = 1; level <= 6; level++) {
    const rule = css.nodes.find(
      (node) =>
        node.type === "rule" &&
        node.selector === `.react-print-h${level}-contents:before`,
    );
    if (rule?.type !== "rule")
      throw new Error(`Missing h${level} display rule`);
    const declaration = rule.nodes.find(
      (node) => node.type === "decl" && node.prop === "content",
    );
    if (declaration?.type !== "decl") throw new Error("Missing content rule");
    expect(declaration.value).toBe(
      `attr(data-before) string(${runningLevels[level - 1]}) attr(data-after)`,
    );
  }
});
