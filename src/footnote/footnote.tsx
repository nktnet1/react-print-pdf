import type React from "react";
import "#/footnote/footnote.css";
import type { DocConfig } from "#/docgen/types";

/**
 * Creates an automatically numbered footnote. This will remove the footnote content from the document flow and place it at the bottom of the page.
 */
type FootnoteProps = React.HTMLAttributes<HTMLSpanElement>;

export const Footnote = ({ children, className, ...props }: FootnoteProps) => {
  return (
    <span
      {...props}
      className={`react-print-footnote text-left text-xs font-normal${className ? ` ${className}` : ""}`}
    >
      {children}
    </span>
  );
};

/** @internal */
export const __docConfig: DocConfig = {
  icon: "InfoIcon",
  description:
    "Create automatically numbered footnotes. Standard span attributes are supported, and custom classes preserve the print-footnote positioning class.",
  components: {
    Footnote: {
      server: true,
      client: true,
      examples: {
        default: {
          template: (
            <div>
              This is a footnote to explaning what CSS{" "}
              <Footnote>
                CSS is the acronym of “Cascading Style Sheets”. CSS is a
                computer language for laying out and structuring web pages (HTML
                or XML).
              </Footnote>{" "}
              is.
            </div>
          ),
        },
      },
    },
  },
};
