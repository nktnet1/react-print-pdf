import React from "react";
import type { DocConfig } from "#/docgen/types";

export const escapeCss = (css: string) => {
  // HTML treats <style> as raw text. Only a closing </style> sequence can end
  // the element prematurely; replacing every '<' corrupts valid CSS strings
  // such as content: "4 < 5" because character references are not decoded.
  // CSS decodes the escaped slash inside strings, preserving their meaning
  // while preventing the HTML parser from seeing a closing style tag.
  return css.replace(/<\/style/gi, (tag) => `<\\${tag.slice(1)}`);
};

export const CSS = ({ children }: { children: string }) => {
  return <style dangerouslySetInnerHTML={{ __html: escapeCss(children) }} />;
};

// CSS strings need their own escaping: HTML escaping cannot prevent a quote
// inside a font URL from terminating url(...) and introducing new CSS rules.
// Escape controls as hex code points followed by a separator, and escape the
// quotation mark and backslash without changing ordinary URL characters.
const quoteCssUrl = (url: string): string => {
  let escaped = "";
  for (const character of url) {
    if (character === '"' || character === "\\") {
      escaped += `\\${character}`;
      continue;
    }

    const code = character.charCodeAt(0);
    escaped +=
      code < 0x20 || code === 0x7f ? `\\${code.toString(16)} ` : character;
  }
  return `"${escaped}"`;
};

export const Font = ({ url }: { url: string }) => {
  return <CSS>{`@import url(${quoteCssUrl(url)});`}</CSS>;
};

type MarginsProps = {
  pageRatio: string;
  top: string;
  right: string;
  left: string;
  bottom: string;
};

const validatePageSize = (value: string): string => {
  const size = value.trim();
  if (!size || /[;{}\0]|\/\*|\*\//.test(size)) {
    throw new Error("Margins pageRatio must be a single CSS page-size value");
  }
  return size;
};

// Bare numbers retain the existing pixel shorthand. Explicit absolute CSS
// lengths are useful for print layouts (e.g. 4mm) and must not gain an extra
// "px" suffix. Keep the input restricted to one length to prevent CSS injection.
const validateMarginLength = (name: string, value: string): string => {
  const length = value.trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|mm|cm|in|pt|pc|q)?$/i.exec(
    length,
  );
  if (!match) {
    throw new Error(`Margins ${name} must be a numeric CSS length`);
  }
  return `${match[1]}${match[2] ?? "px"}`;
};

export const Margins = ({
  pageRatio,
  top,
  right,
  left,
  bottom,
}: MarginsProps) => {
  const size = validatePageSize(pageRatio);
  const margins = {
    top: validateMarginLength("top", top),
    right: validateMarginLength("right", right),
    left: validateMarginLength("left", left),
    bottom: validateMarginLength("bottom", bottom),
  };

  return (
    <CSS>{`@page {size: ${size};margin-top:${margins.top};margin-right:${margins.right};margin-left:${margins.left};margin-bottom:${margins.bottom};}`}</CSS>
  );
};

export const __docConfig: DocConfig = {
  name: "CSS",
  icon: "PaletteIcon",
  description: `Add CSS declarations and at-rules to your document.

The \`CSS\` component escapes closing \`</style>\` sequences so the stylesheet cannot accidentally terminate its HTML element. It does **not** validate or sanitise arbitrary CSS. Only pass trusted stylesheet content, not raw CSS supplied by users. For font URLs, use the \`Font\` component, which quotes and escapes the URL value.`,
  components: {
    CSS: {
      server: true,
      client: true,
      examples: {
        default: {
          description: "Use a simple CSS tag to support CSS in your document.",
          template: <CSS>{`@page { size: a4 landscape; }`}</CSS>,
        },
      },
    },
    Font: {
      server: true,
      client: true,
      examples: {
        default: {
          name: "Load a Google Font",
          description:
            "Load a Google Font from its URL. This will allow you to use the font in your document.",
          template: (
            <React.Fragment>
              <Font url="https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap" />
              <p style={{ fontFamily: "Roboto, sans-serif" }}>
                This text uses the Roboto Light font.
              </p>
            </React.Fragment>
          ),
        },
      },
    },
    Margins: {
      server: true,
      client: true,
      examples: {
        default: {
          name: "Layout",
          description:
            "Set the page size and margins. Bare numbers are interpreted as pixels; explicit CSS lengths such as `4mm`, `1cm`, or `12pt` are also supported. You can also use the `@page` at-rule in CSS to manage all aspects of printed pages. More on this [here](https://developer.mozilla.org/en-US/docs/Web/CSS/@page).",
          imports: ["CSS"],
          template: (
            <React.Fragment>
              <CSS>{`body{background-color:lightblue}`}</CSS>
              <Margins
                pageRatio="A4"
                top="100"
                right="100"
                left="100"
                bottom="100"
              />
              <div>Hello world!</div>
            </React.Fragment>
          ),
        },
      },
    },
  },
};
