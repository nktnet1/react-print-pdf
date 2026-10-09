const assert = require("node:assert/strict");

// Invoked separately with real require() and import namespaces from the
// Verdaccio-installed tarball, not with source-tree aliases or workspace files.
const verifyConsumerCompilation = async ({
  format,
  root,
  client,
  createElement,
  Global,
  jsx,
}) => {
  for (const [entrypoint, { compile, Tailwind }] of [
    ["root", root],
    ["client", client],
  ]) {
    const context = `${format} ${entrypoint}`;

    const tailwindHtml = await compile(
      createElement(
        Tailwind,
        {
          preflight: false,
          stylesheet: "@theme { --color-verdaccio-brand: #365a87; }",
        },
        createElement(
          "div",
          { className: "bg-verdaccio-brand p-4" },
          `${context} Tailwind`,
        ),
      ),
    );
    assert.match(
      tailwindHtml,
      /\.bg-verdaccio-brand\s*\{[^}]*background-color:/,
      context,
    );
    assert.match(tailwindHtml, /#365a87/, context);
    assert.match(tailwindHtml, /\.p-4\s*\{[^}]*padding:/, context);
    assert.ok(tailwindHtml.includes(`${context} Tailwind`), context);
    // The Tailwind compiler retains inert boundaries so that separately
    // configured regions cannot leak styles into one another. The installed
    // package must preserve both markers and the matching CSS @scope rule.
    const start = tailwindHtml.match(
      /<template data-react-print-tailwind-start="([^"]+)"><\/template>/,
    );
    const end = tailwindHtml.match(
      /<template data-react-print-tailwind-end="([^"]+)"><\/template>/,
    );
    assert.ok(start, `${context}: missing Tailwind start boundary`);
    assert.equal(end?.[1], start[1], `${context}: mismatched boundaries`);
    assert.ok(tailwindHtml.includes("@scope"), context);
    assert.ok(
      tailwindHtml.includes(`data-react-print-tailwind-start="${start[1]}"`),
      context,
    );

    const emotionHtml = await compile(
      createElement(
        "main",
        null,
        createElement(Global, {
          styles: { ".verdaccio-global": { color: "#234567" } },
        }),
        jsx(
          "p",
          {
            className: "verdaccio-global",
            css: { paddingInlineStart: "9px" },
          },
          `${context} Emotion`,
        ),
      ),
      { emotion: true },
    );
    assert.match(emotionHtml, /\.verdaccio-global\s*\{[^}]*color:/, context);
    assert.match(emotionHtml, /#234567/, context);
    assert.match(emotionHtml, /\.react-print-pdf-[a-z0-9-]+/, context);
    assert.match(
      emotionHtml,
      /padding-(?:left|right|inline-start):\s*9px/,
      context,
    );
    assert.ok(emotionHtml.includes(`${context} Emotion`), context);
    assert.doesNotMatch(emotionHtml, /<style\b[^>]*\bdata-emotion=/i, context);
    assert.doesNotMatch(emotionHtml, /data-react-print-tailwind-/, context);
  }
};

module.exports = { verifyConsumerCompilation };
