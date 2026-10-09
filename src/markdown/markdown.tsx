import { compiler, type MarkdownToJSX } from "markdown-to-jsx";
import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { CSS } from "#/css/css";
import type { DocConfig } from "#/docgen/types";
import { PageBreak } from "#/shell/shell";
import { Tailwind } from "#/tailwind/tailwind";

interface TocRendererProps {
  heading: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  level: number;
  children: ReactNode;
  id: string;
}

interface MarkdownProps {
  children: ReactNode;
  tocRenderer?: (props: TocRendererProps) => ReactNode;
  options?: MarkdownToJSX.Options;
}

const renderMarkdownChildren = (
  children: ReactNode,
  options?: MarkdownToJSX.Options,
): ReactElement => {
  const rendered: ReactNode[] = [];
  let markdown = "";

  // Compile adjacent text together so Markdown syntax can span JSX text nodes.
  // Keep actual React elements intact instead of coercing them to strings.
  const flushMarkdown = () => {
    if (!markdown) return;
    rendered.push(compiler(markdown, options));
    markdown = "";
  };

  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (node) => {
      if (typeof node === "string" || typeof node === "number") {
        markdown += String(node);
      } else if (
        isValidElement<{ children?: ReactNode }>(node) &&
        node.type === Fragment
      ) {
        visit(node.props.children);
      } else if (
        node !== null &&
        node !== undefined &&
        typeof node !== "boolean"
      ) {
        flushMarkdown();
        rendered.push(node);
      }
    });
  };

  visit(children);
  flushMarkdown();

  // A Fragment keeps the component's return type JSX-compatible even when
  // ReactNode-typed input contains arrays, portals or no content at all.
  return (
    <>{rendered.length === 1 ? rendered[0] : Children.toArray(rendered)}</>
  );
};

export const Markdown = (props: MarkdownProps) => {
  const headers: TocRendererProps[] = [];

  type MarkdownElementProps = { children?: ReactNode; id?: string };

  const isReactElement = (
    child: ReactNode,
  ): child is ReactElement<MarkdownElementProps> => {
    return isValidElement<MarkdownElementProps>(child);
  };

  const detectHeader = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isReactElement(child)) return;

      if (
        typeof child.type === "string" &&
        ["h1", "h2", "h3", "h4", "h5", "h6"].includes(child.type)
      ) {
        headers.push({
          heading: child.type,
          level: parseInt(child.type[1], 10),
          children: child.props.children,
          id: child.props.id,
        } as TocRendererProps);
      }

      // Only traverse the elements React has already been given. Calling a
      // function component (or constructing a class component) to look inside
      // it would render it outside React's lifecycle, breaking hooks, context,
      // and render counts. Headings returned by components cannot be known
      // statically; include them directly in Markdown/JSX to add them to TOC.
      if (child.type === Fragment || typeof child.type === "string") {
        detectHeader(child.props.children);
      }
    });
  };

  const tocRenderer = props.tocRenderer;

  if (tocRenderer)
    detectHeader(renderMarkdownChildren(props.children, props.options));

  // Let React invoke each renderer in its own component lifecycle. Calling the
  // renderer here would associate its hooks with Markdown and render it early.
  const Toc = tocRenderer
    ? Children.toArray(
        headers.map((header) => createElement(tocRenderer, header)),
      )
    : null;

  return renderMarkdownChildren(
    props.children,
    Object.assign({}, props.options, {
      overrides: {
        Toc: tocRenderer
          ? {
              component: () => Toc,
            }
          : undefined,
        ...props.options?.overrides,
      },
    }),
  );
};

/** @internal */
export const __docConfig: DocConfig = {
  description: `Render Markdown inside your templates. Provides a simple wrapper around [\`markdown-to-jsx\`](https://github.com/quantizor/markdown-to-jsx).

Markdown allows you to easily separate content from the layout, making it easier to maintain and update your templates. You can pull in content from a CMS or other sources, and use Markdown to format it. ReactNode-typed content is supported: adjacent text is parsed as Markdown, while JSX elements are preserved.

You can also use custom components and variables to make your Markdown more dynamic. For example, you can replace Markdown components with your own components, or use variables to insert dynamic content.`,
  icon: "FileTextIcon",
  components: {
    Markdown: {
      server: true,
      client: true,
      examples: {
        default: {
          description:
            "Use a simple Markdown tag to support Markdown in your document.",
          template: (
            <Markdown>{`# Hello, world!

> This is a blockquote

---

This is a paragraph with a [link](https://google.com)`}</Markdown>
          ),
        },
        customComponent: {
          name: "Custom Components and Variables",
          description:
            "You can leverage the `overrides` prop to replace Markdown components with your own components. This is useful for custom components or even for dynamic content.",
          template: (
            <Markdown
              options={{
                overrides: {
                  AgreementTitle: {
                    component: () => "Non-Disclosure Agreement",
                  },
                  CustomerName: {
                    component: () => "John Doe",
                  },
                  KPI: {
                    component: ({ children }: { children: ReactNode }) => (
                      <div style={{ color: "blue", fontSize: "2rem" }}>
                        {children}
                      </div>
                    ),
                  },
                },
              }}
            >{`# <AgreementTitle />

This agreement is signed with <CustomerName />.

<KPI>20/month</KPI>`}</Markdown>
          ),
        },
        tableOfContents: {
          name: "Table of Contents",
          description: `You can use the \`tocRenderer\` prop to render a table of contents from your Markdown content. The headers will be automatically detected and rendered in the order they appear. You need to place the \`<Toc />\` component in your Markdown content to render the table of contents.

You can also use the \`id\` attribute in your headers to link to them directly. Headings must appear in the Markdown source or as JSX elements inside native elements/fragments; headings produced inside custom React components are not introspected. The \`tocRenderer\` is rendered as a React component, so it may use hooks.`,
          template: (
            <Tailwind
              config={{
                corePlugins: {
                  preflight: false,
                },
              }}
            >
              <CSS>{`a.-toc-link:after {
                content: target-counter(attr(href), page);
                float: right;
              }`}</CSS>
              <Markdown
                options={{
                  overrides: {
                    PageBreak: {
                      component: PageBreak, // import { PageBreak } from "react-print-pdf";
                    },
                  },
                }}
                tocRenderer={({ level, children, id }) => (
                  <a
                    className="block py-2 border-b -toc-link"
                    style={{
                      paddingLeft: `${(level - 1) * 1}rem`,
                    }}
                    href={`#${id}`}
                  >
                    {children}
                  </a>
                )}
              >{`# Table of Contents

<Toc />

<PageBreak />

# This is a level 1 header

## This is a level 2 header

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.

## This is another level 2 header

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.

# This is a level 1 header, bis

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed non risus. Suspendisse lectus tortor, dignissim sit amet, adipiscing nec, ultricies sed, dolor. Cras elementum ultrices diam. Maecenas ligula massa, varius a, semper congue, euismod non, mi.`}</Markdown>
            </Tailwind>
          ),
        },
      },
    },
  },
};
