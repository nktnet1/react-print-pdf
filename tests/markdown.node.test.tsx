import { Component, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "react-print-pdf";
import { expect, test } from "vitest";

// Regression for #51: a CMS description is often typed as ReactNode, even
// when its runtime value is a Markdown string.
const renderDescription = (description: ReactNode) =>
  renderToStaticMarkup(
    <Markdown options={{ forceBlock: true }}>{description}</Markdown>,
  );

test("accepts ReactNode-typed Markdown strings", () => {
  const html = renderDescription("# Report\n\nAn **important** result.");

  expect(html).toMatch(/<h1\b[^>]*>Report<\/h1>/);
  expect(html).toContain("<strong>important</strong>");
});

test("joins adjacent text and fragments before parsing Markdown", () => {
  const html = renderDescription(
    <>
      {"# Report\n\n"}
      {"An **important"}
      {" result**."}
      {0}
    </>,
  );

  expect(html).toMatch(/<h1\b[^>]*>Report<\/h1>/);
  expect(html).toContain("<strong>important result</strong>");
  expect(html).toContain("0");
});

test("preserves React elements alongside Markdown text", () => {
  const html = renderDescription([
    "**Before**",
    <span key="custom" data-custom="true">
      Custom
    </span>,
    "*After*",
  ]);

  expect(html).toContain("<strong>Before</strong>");
  expect(html).toContain('<span data-custom="true">Custom</span>');
  expect(html).toContain("<em>After</em>");
  expect(html).not.toContain("[object Object]");
  expect(renderDescription(null)).toBe("");
});

test("ignores empty and boolean children without breaking adjacent Markdown", () => {
  const html = renderDescription([
    "**Before",
    false,
    null,
    undefined,
    true,
    <Fragment key="split-markdown">
      {" the "}
      {"element**"}
    </Fragment>,
    <span key="inline">Inline element</span>,
    0,
    " and *after*",
  ]);

  expect(html).toContain("<strong>Before the element</strong>");
  expect(html).toContain("<span>Inline element</span>");
  expect(html).toContain("0 and <em>after</em>");
  expect(html).not.toContain("false");
  expect(html).not.toContain("true");
  expect(renderDescription([false, undefined, true, null])).toBe("");
});

test("detects headings across ReactNode children for a table of contents", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ level, children }) => (
        <span data-toc-level={level}>{children}</span>
      )}
    >
      {["# First\n\n<Toc />\n\n", "## Second"]}
    </Markdown>,
  );

  expect(html).toContain('data-toc-level="1"');
  expect(html).toContain('data-toc-level="2"');
  expect(html).toContain("First");
  expect(html).toContain("Second");
});

test("TOC discovers nested headings returned by class and function components", () => {
  class ClassHeading extends Component {
    render() {
      return <h2 id="class-section">Class section</h2>;
    }
  }

  const FunctionHeading = () => <h3 id="function-section">Function section</h3>;

  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ level, id, children }) => (
        <a href={`#${id}`} data-toc-level={level}>
          {children}
        </a>
      )}
    >
      {"<Toc />\n\n"}
      <section>
        <ClassHeading />
        <FunctionHeading />
      </section>
    </Markdown>,
  );

  expect(html).toContain('href="#class-section"');
  expect(html).toContain('href="#function-section"');
  expect(html).toContain('data-toc-level="2"');
  expect(html).toContain('data-toc-level="3"');
});

test("explicit Toc overrides take precedence over the generated table of contents", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ children }) => <a href="#generated">{children}</a>}
      options={{
        overrides: {
          Toc: {
            component: () => <span data-manual-toc>Custom contents</span>,
          },
        },
      }}
    >
      {"# Chapter\n\n<Toc />"}
    </Markdown>,
  );

  expect(html).toMatch(/<h1\b[^>]*>Chapter<\/h1>/);
  expect(html).toContain('<span data-manual-toc="true">Custom contents</span>');
  expect(html).not.toContain('href="#generated"');
});

test("an empty table of contents does not introduce placeholder markup", () => {
  const html = renderToStaticMarkup(
    <Markdown tocRenderer={({ children }) => <a href="#heading">{children}</a>}>
      {"<Toc />\n\nNo sections yet."}
    </Markdown>,
  );

  expect(html).toContain("No sections yet.");
  expect(html).not.toContain("<a ");
  expect(html).not.toContain("<Toc");
});
