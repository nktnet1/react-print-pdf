import { createElement, type ReactNode } from "react";
import {
  compile,
  compileWithGotenberg,
  Footnote,
  GotenbergError,
  type GotenbergRequestOptions,
  Markdown,
  Tailwind,
} from "react-print-pdf";
import { compile as compileClient } from "react-print-pdf/client";
import { useMDXComponents } from "react-print-pdf/mdx";
import {
  compileWithPlaywright,
  type PlaywrightCompileOptions,
} from "react-print-pdf/playwright";

const children: ReactNode = ["## Report", createElement("em", null, "details")];
const element = createElement(Markdown, null, children);
const tailwind = createElement(Tailwind, null, element);
const gotenberg: GotenbergRequestOptions = { baseUrl: "http://localhost:3000" };
const playwright: PlaywrightCompileOptions = { pdf: { format: "A4" } };

void compile(tailwind);
void compileClient(tailwind);
void compileWithGotenberg(tailwind, gotenberg);
void compileWithPlaywright(tailwind, playwright);
void new GotenbergError({ status: 400, statusText: "Bad Request" });
void useMDXComponents;

// Public component types must accept standard span attributes.
void createElement(
  Footnote,
  { className: "source", id: "source-1", style: { color: "navy" } },
  "Source citation",
);
