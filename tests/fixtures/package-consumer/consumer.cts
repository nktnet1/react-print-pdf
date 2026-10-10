import { createElement } from "react";
import {
  type CompileOptions,
  compile,
  Footnote,
  Markdown,
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
