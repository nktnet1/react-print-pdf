import {
  Component,
  createContext,
  Fragment,
  isValidElement,
  type ReactNode,
  useContext,
  useId,
  useState,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "react-print-pdf";
import { expect, test, vi } from "vitest";

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

test("TOC collects nested JSX headings without evaluating custom components", () => {
  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ level, id, children }) => (
        <a href={`#${id}`} data-toc-level={level}>
          {children}
        </a>
      )}
    >
      {"<Toc />\n\n# Markdown section\n\n"}
      <Fragment key="jsx-headings">
        <h2 id="jsx-section">JSX section</h2>
        <section>
          <h3 id="nested-section">Nested section</h3>
        </section>
      </Fragment>
    </Markdown>,
  );

  expect(html).toContain('href="#jsx-section"');
  expect(html).toContain('href="#nested-section"');
  expect(html).toContain('data-toc-level="1"');
  expect(html).toContain('data-toc-level="2"');
  expect(html).toContain('data-toc-level="3"');
});

test("TOC renderers receive keyed children without React key warnings", () => {
  const observedKeys: Array<string | null> = [];
  // Give this renderer its own name so React's per-component warning
  // deduplication cannot make an earlier test mask a regression.
  const KeyedTocRenderer = ({ children }: { children: ReactNode }) => {
    if (Array.isArray(children)) {
      for (const child of children) {
        if (isValidElement(child)) observedKeys.push(child.key);
      }
    }
    return <span data-toc-entry="true">{children}</span>;
  };

  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  let html = "";
  let keyWarnings: unknown[][] = [];
  try {
    html = renderToStaticMarkup(
      <Markdown tocRenderer={KeyedTocRenderer}>
        {"# Markdown **bold** and [link](#next)\n\n<Toc />\n\n"}
        <h2 id="next">
          JSX <strong>bold</strong> and <em>italic</em>
        </h2>
      </Markdown>,
    );
    keyWarnings = errors.mock.calls.filter(
      ([message]) =>
        typeof message === "string" &&
        message.includes(
          'Each child in a list should have a unique "key" prop.',
        ),
    );
  } finally {
    errors.mockRestore();
  }

  expect(keyWarnings).toEqual([]);
  expect(observedKeys.length).toBeGreaterThan(0);
  expect(observedKeys.every((key) => key !== null)).toBe(true);
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain('data-toc-entry="true"');
});

test("TOC preserves nested JSX heading children and headings without ids", () => {
  const entries: Array<{
    heading: string;
    id: string | undefined;
    children: ReactNode;
  }> = [];
  const NestedTocRenderer = ({
    heading,
    id,
    children,
  }: {
    heading: string;
    id?: string;
    children: ReactNode;
  }) => {
    entries.push({ heading, id, children });
    return <span data-toc-heading={heading}>{children}</span>;
  };

  const html = renderToStaticMarkup(
    <Markdown tocRenderer={NestedTocRenderer}>
      {"<Toc />\n\n"}
      <h2 id="nested-heading">
        {[
          ["Nested ", <strong key="strong">bold</strong>],
          [" and ", <em key="em">italic</em>],
        ]}
      </h2>
      <h3>Heading without an id</h3>
    </Markdown>,
  );

  expect(entries).toHaveLength(2);
  expect(entries.map(({ heading, id }) => [heading, id])).toEqual([
    ["h2", "nested-heading"],
    ["h3", undefined],
  ]);
  const nested = entries[0]?.children;
  expect(Array.isArray(nested)).toBe(true);
  if (!Array.isArray(nested)) throw new Error("Expected nested TOC content");
  expect(nested).toHaveLength(2);
  const nestedKeys = nested.flatMap((group) =>
    Array.isArray(group)
      ? group.filter(isValidElement).map((child) => child.key)
      : [],
  );
  expect(nestedKeys).toEqual(["strong", "em"]);
  expect(html).toContain("Nested <strong>bold</strong> and <em>italic</em>");
  expect(html).toContain('data-toc-heading="h3"');
  expect(html).toContain("Heading without an id");
});

test("TOC does not invoke hook components or class render methods during discovery", () => {
  const SectionContext = createContext("missing");
  let functionRenders = 0;
  let classRenders = 0;

  const FunctionHeading = () => {
    functionRenders++;
    const id = useId();
    const label = useContext(SectionContext);
    const [section] = useState("Function section");
    return <h2 id={id}>{`${label} ${section}`}</h2>;
  };

  class ClassHeading extends Component {
    render() {
      classRenders++;
      return <h3 id="class-section">Class section</h3>;
    }
  }

  const html = renderToStaticMarkup(
    <SectionContext.Provider value="Context-aware">
      <Markdown
        tocRenderer={({ level, children }) => (
          <span data-toc-level={level}>{children}</span>
        )}
      >
        {"# Static section\n\n<Toc />\n\n"}
        <section>
          <FunctionHeading />
          <ClassHeading />
        </section>
      </Markdown>
    </SectionContext.Provider>,
  );

  expect(functionRenders).toBe(1);
  expect(classRenders).toBe(1);
  expect(html).toContain("Context-aware Function section");
  expect(html).toContain('id="class-section"');
  expect(html).toContain('data-toc-level="1"');
  expect(html).not.toContain('data-toc-level="2"');
  expect(html).not.toContain('data-toc-level="3"');
});

test("TOC does not pre-render hook components provided as Markdown overrides", () => {
  let renders = 0;
  const DynamicHeading = () => {
    renders++;
    const id = useId();
    return <h2 id={id}>Dynamic override heading</h2>;
  };

  const html = renderToStaticMarkup(
    <Markdown
      options={{ overrides: { DynamicHeading: { component: DynamicHeading } } }}
      tocRenderer={({ level, children }) => (
        <span data-toc-level={level}>{children}</span>
      )}
    >
      {"# Static heading\n\n<Toc />\n\n<DynamicHeading />"}
    </Markdown>,
  );

  expect(renders).toBe(1);
  expect(html).toContain("Dynamic override heading");
  expect(html.match(/data-toc-level=/g)).toHaveLength(1);
});

test("TOC renderer runs during React rendering and can use hooks", () => {
  const LabelContext = createContext("outside");
  let precedingChildRendered = false;
  let rendererCalls = 0;

  const PrecedingChild = () => {
    precedingChildRendered = true;
    return <span>Intro</span>;
  };

  const HookToc = ({
    level,
    children,
  }: {
    level: number;
    children: ReactNode;
  }) => {
    // A render prop invoked eagerly by Markdown runs before its children render.
    expect(precedingChildRendered).toBe(true);
    rendererCalls++;
    const label = useContext(LabelContext);
    const [suffix] = useState("entry");
    const id = useId();
    return (
      <span id={id} data-toc-level={level}>
        {label} {suffix}: {children}
      </span>
    );
  };

  const html = renderToStaticMarkup(
    <LabelContext.Provider value="Contextual">
      <Markdown tocRenderer={HookToc}>
        <PrecedingChild />
        {"# First\n\n<Toc />\n\n## Second"}
      </Markdown>
    </LabelContext.Provider>,
  );

  expect(rendererCalls).toBe(2);
  expect(html).toContain("Contextual entry: First");
  expect(html).toContain("Contextual entry: Second");
  expect(html).toContain('data-toc-level="1"');
  expect(html).toContain('data-toc-level="2"');
  const tocIds = Array.from(
    html.matchAll(/<span id="([^"]+)" data-toc-level=/g),
    ([, id]) => id,
  );
  expect(tocIds).toHaveLength(2);
  expect(new Set(tocIds).size).toBe(2);
});

test("TOC does not invoke a renderer without a Toc placeholder", () => {
  let calls = 0;
  renderToStaticMarkup(
    <Markdown
      tocRenderer={() => {
        calls++;
        return <span>Unused TOC</span>;
      }}
    >
      {"# Chapter without a table of contents"}
    </Markdown>,
  );
  expect(calls).toBe(0);
});

test("TOC ignores headings passed to components that do not render them", () => {
  const OmitContent = ({ children: _children }: { children: ReactNode }) => (
    <p>Intentionally omitted</p>
  );

  const html = renderToStaticMarkup(
    <Markdown
      tocRenderer={({ id, children }) => <a href={`#${id}`}>{children}</a>}
    >
      {"<Toc />\n\n"}
      <OmitContent>
        <h2 id="hidden-section">Hidden section</h2>
      </OmitContent>
    </Markdown>,
  );

  expect(html).toContain("Intentionally omitted");
  expect(html).not.toContain("Hidden section");
  expect(html).not.toContain('href="#hidden-section"');
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
