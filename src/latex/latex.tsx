import katex from "katex";
import { escapeCss } from "#/css/css";
import type { DocConfig } from "#/docgen/types";

// Injected by the package/test compiler with the CSS and WOFF2 fonts from the
// exact KaTeX dependency version. React hoists/deduplicates style resources so
// multiple Latex components only include these fonts once per document.
declare const __REACT_PRINT_KATEX_CSS__: string;

export const Latex = ({ children }: { children: string }) => {
  const html = katex.renderToString(children, {
    throwOnError: false,
  });

  return (
    <>
      <style
        href="react-print-pdf-katex"
        precedence="default"
        dangerouslySetInnerHTML={{
          __html: escapeCss(__REACT_PRINT_KATEX_CSS__),
        }}
      />
      <span dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
};

/** @internal */
export const __docConfig: DocConfig = {
  name: "LaTeX",
  icon: "RadicalIcon",
  description: `Render LaTeX formulas right in your React components.

<Warning>
LaTeX rendering is still in beta. Please report any issues you encounter on our [Discord](https://discord.com/invite/uRJE6e2rgr).
</Warning>

<Note>LaTeX includes the matching KaTeX stylesheet and fonts in the generated document, so printing also works offline.</Note>

<Tip>You can use \`String.raw\` to avoid escaping LaTeX backslashes.</Tip>`,
  components: {
    Latex: {
      server: true,
      client: true,
      examples: {
        default: {
          description:
            "Use a simple Latex tag to support Latex in your document.",
          template: <Latex>{String.raw`\frac{1}{2}`}</Latex>,
        },
        complex: {
          description: "Write complex LaTeX formulas in your document.",
          template: (
            <Latex>{String.raw`% \f is defined as #1f(#2) using the macro
\f\relax{x} = \int_{-\infty}^\infty
    \f\hat\xi\,e^{2 \pi i \xi x}
    \,d\xi`}</Latex>
          ),
        },
      },
    },
  },
};
