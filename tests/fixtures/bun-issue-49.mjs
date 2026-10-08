import { createElement } from "react";
import { compile } from "react-print-pdf";
import { compile as compileClient, Latex } from "react-print-pdf/client";

// Issue #49: Bun 1.1.26 failed to parse this String.raw template in the
// published ESM bundle, although Node could import it.
const example = createElement(
  Latex,
  null,
  String.raw`% \f is defined as #1f(#2) using the macro
\f\relax{x} = \int_{-\infty}^\infty
    \f\hat\xi\,e^{2 \pi i \xi x}
    \,d\xi`,
);

if (typeof compile !== "function" || typeof compileClient !== "function") {
  throw new Error("Bun could not import the ESM compile entrypoints");
}

if (!example.props.children.includes("#1f(#2)")) {
  throw new Error("Bun did not parse the LaTeX example correctly");
}

console.log("bun-import-ok");
