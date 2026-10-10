import { createElement } from "react";
import {
  type CompileOptions,
  compile,
  Footnote,
  Markdown,
  PageNumber,
  PagesNumber,
  RunningH1,
  RunningH6,
  Tailwind,
} from "react-print-pdf";
import { compile as compileClient } from "react-print-pdf/client";
import { useMDXComponents } from "react-print-pdf/mdx";
import { convertHtmlWithPlaywright } from "react-print-pdf/playwright";

const options: CompileOptions = { emotion: false };
const element = createElement(Markdown, null, "## CommonJS");

void compile(element, options);
void compileClient(element);
void convertHtmlWithPlaywright("<h1>CommonJS</h1>");
void useMDXComponents;

// Public component types must accept standard span attributes.
void createElement(
  Footnote,
  { className: "source", id: "source-1", style: { color: "navy" } },
  "Source citation",
);

// Counter placeholders and running headings expose the underlying span API.
void createElement(PageNumber, {
  className: "page-number",
  id: "current-page",
  style: { color: "navy" },
  "aria-label": "Current page",
});
void createElement(PagesNumber, {
  counterStyle: "lower-roman",
  title: "Total pages",
});
void createElement(RunningH1, {
  before: "Chapter: ",
  after: " (continued)",
  className: "chapter-title",
  lang: "en",
});
void createElement(RunningH6, { "aria-label": "Deepest heading" });

// A JSX heading inside Markdown may have no id, despite Markdown text
// headings receiving generated ids. The published callback type must match.
void createElement(
  Markdown,
  {
    tocRenderer: ({ id, children }) => {
      // @ts-expect-error Consumers must narrow an optional id before using it.
      id.toUpperCase();
      return createElement("a", id ? { href: `#${id}` } : {}, children);
    },
  },
  "<Toc />",
);

// Passing children as createElement's third argument must work with options.
void createElement(
  Markdown,
  { options: { forceBlock: true } },
  "## Node report",
);
void createElement(
  Tailwind,
  { preflight: false },
  createElement("p", { className: "font-bold" }, "Print"),
);
