import { Button, ChakraProvider } from "@chakra-ui/react";
import isPseudoClass from "@csstools/postcss-is-pseudo-class";
import postcss from "postcss";
import type React from "react";
import { CSS } from "#/css/css";
import type { DocConfig } from "#/docgen/types";
import {
  createTailwindStyleCollector,
  Tailwind,
  TailwindStyleCollectorProvider,
} from "#/tailwind/tailwind";
import footnoteStyles from "../footnote/footnote.css?raw";
import genericStyles from "../generic.css?raw";
import shellStyles from "../shell/shell.css?raw";
import headingStyles from "../variables/headings.css?raw";
import variableStyles from "../variables/variables.css?raw";

const printStyles = [
  genericStyles,
  footnoteStyles,
  shellStyles,
  headingStyles,
  variableStyles,
].join("\n");

const emotionStyleTagPattern =
  /<style\b[^>]*\bdata-emotion=(?:"[^"]*"|'[^']*')[^>]*>([\s\S]*?)<\/style>/gi;

const extractEmotionStyleTags = (html: string) => {
  let css = "";
  const cleanedHtml = html.replace(
    emotionStyleTagPattern,
    (_styleTag, styleContents: string) => {
      css += styleContents;
      return "";
    },
  );

  return { html: cleanedHtml, css };
};

export interface CompileOptions {
  /**
   * Whether to use Emotion CSS.
   */
  emotion?: boolean;
}

export const compile = async (
  node: React.ReactElement,
  options?: CompileOptions,
) => {
  const { emotion } = Object.assign(
    {
      emotion: false,
    },
    options || {},
  );

  const ReactDOMServer = await import("react-dom/server");

  let Element = (
    <>
      <CSS>{printStyles}</CSS>
      {node}
    </>
  );

  const tailwindCollector = createTailwindStyleCollector();

  if (!emotion) {
    const html = ReactDOMServer.renderToString(
      <TailwindStyleCollectorProvider collector={tailwindCollector}>
        {Element}
      </TailwindStyleCollectorProvider>,
    );
    return tailwindCollector.resolve(html);
  }

  const { CacheProvider } = await import("@emotion/react");
  const { default: createCache } = await import("@emotion/cache");

  const styleContainer =
    typeof document === "undefined" ? undefined : document.createElement("div");
  const cache = createCache({
    key: "react-print-pdf",
    ...(styleContainer
      ? {
          container: styleContainer,
          // Emotion's speedy mode inserts CSS through CSSOM, where textContent
          // is intentionally empty. Disable it for this detached collector.
          speedy: false,
        }
      : {}),
  });

  // On Node, compat mode keeps generated rules in cache.inserted instead of
  // requiring @emotion/server to recover them later.
  cache.compat = true;

  Element = (
    <TailwindStyleCollectorProvider collector={tailwindCollector}>
      <CacheProvider value={cache}>{Element}</CacheProvider>
    </TailwindStyleCollectorProvider>
  );

  const renderedHtml = await tailwindCollector.resolve(
    ReactDOMServer.renderToString(Element),
  );
  const { html, css: inlineEmotionCss } = extractEmotionStyleTags(renderedHtml);
  const cachedEmotionCss = styleContainer
    ? Array.from(
        styleContainer.querySelectorAll<HTMLStyleElement>(
          "style[data-emotion]",
        ),
        (style) => style.textContent || "",
      ).join("")
    : Object.values(cache.inserted)
        .filter((value): value is string => typeof value === "string")
        .join("");

  cache.sheet.flush();

  const mergedStylesheet = `${inlineEmotionCss}${cachedEmotionCss}`;

  const { default: cssvariables } = await import("postcss-css-variables");
  const { default: logical } = await import("postcss-logical");

  const result = await postcss([
    cssvariables(),
    logical(),
    isPseudoClass(),
  ]).process(mergedStylesheet, {
    from: undefined,
  });

  return `<style>${result.css}</style>${html}`;
};

/** @internal */
export const __docConfig: DocConfig = {
  name: "compile",
  icon: "CodeXmlIcon",
  description:
    "Compile a React component to a string with the React Print PDF styles.",
  components: {
    compile: {
      server: true,
      client: true,
      examples: {
        default: {
          description: `A simple function to compile a React component to an HTML string with the React Print PDF styles.
          \`\`\`jsx
          const html = await compile(<Component />);
          \`\`\``,
          template: (
            <Tailwind>
              <div className="bg-red-400">Hello World!</div>
            </Tailwind>
          ),
        },
        emotion: {
          description: `Pass \`{ emotion: true }\` as the second compile option to merge and extract critical CSS using Emotion. Some libraries such as Chakra UI require this option to work correctly.

\`\`\`jsx
const html = await compile(<Component />, { emotion: true });
\`\`\``,
          template: (
            <>
              <ChakraProvider>
                <Button colorScheme="blue">Hello</Button>
              </ChakraProvider>
            </>
          ),
          name: "Emotion CSS",
          compileOptions: {
            emotion: true,
          },
          externalImports: [
            `import { Button, ChakraProvider, extendTheme } from "@chakra-ui/react";`,
          ],
        },
      },
    },
  },
};
