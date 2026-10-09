import React from "react";
import type { DocConfig } from "#/docgen/types";

export const escapeCss = (css: string) => {
  // <style> is a raw-text HTML element: character references such as &amp;
  // are not decoded. HTML-encoding CSS corrupts URLs and literal text.
  // Escape '<' to prevent a CSS string containing </style> from ending the
  // element, while preserving every other character as authored. In
  // particular, :where() must retain its zero specificity; replacing it with
  // :is() changes the cascade and breaks otherwise valid stylesheets.
  return css.replaceAll("<", "&lt;");
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
export const Margins = ({
  pageRatio,
  top,
  right,
  left,
  bottom,
}: MarginsProps) => {
  return (
    <CSS>{`@page {size: ${pageRatio};margin-top:${top}px;margin-right:${right}px;margin-left:${left}px;margin-bottom:${bottom}px;}`}</CSS>
  );
};

/** @internal */
export const __docConfig: DocConfig = {
  name: "CSS",
  icon: "PaletteIcon",
  description: `Allows adding CSS to the document while securely parsing and escaping it.

NB: While you can add regular CSS with the \`<style>\` tag, it's recommended to use the \`CSS\` component to ensure that the CSS is properly escaped, most notably when using URLs or other potentially unsafe content.`,
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
            "Set the page ratio and margin sizes in px. You can also use the `@page` at-rule in CSS to manage all aspects of printed pages. More on this [here](https://developer.mozilla.org/en-US/docs/Web/CSS/@page).",
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
