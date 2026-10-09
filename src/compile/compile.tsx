import { Button, ChakraProvider, defaultSystem } from "@chakra-ui/react";
import isPseudoClass from "@csstools/postcss-is-pseudo-class";
import postcss from "postcss";
import type React from "react";
import { renderToString } from "react-dom/server";
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

// Tokenize whole start/end tags, not just style and raw-text tags. A valid
// non-style element may have a quoted attribute containing literal "<style>"
// text, which must not be treated as a real stylesheet. Quotes may contain '>'.
const htmlTagPattern =
  /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const rawTextTags = new Set([
  "style",
  "script",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
]);
const styleAttributePattern =
  /(?:^|\s+)([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;

const hasEmotionAttribute = (attributes: string): boolean => {
  // A word boundary also matches `data-widget-data-emotion`, accidentally
  // removing otherwise ordinary styles. Consume complete attributes instead,
  // including quoted values that may themselves mention `data-emotion`.
  for (const match of attributes.matchAll(styleAttributePattern)) {
    if (match[1].toLowerCase() === "data-emotion" && match[0].includes("=")) {
      return true;
    }
  }
  return false;
};

const extractEmotionStyleTags = (html: string) => {
  let css = "";
  let cursor = 0;
  let cleanedHtml = "";
  htmlTagPattern.lastIndex = 0;

  for (
    let match = htmlTagPattern.exec(html);
    match;
    match = htmlTagPattern.exec(html)
  ) {
    const tagName = match[2]?.toLowerCase();
    if (!tagName || match[1] === "/" || !rawTextTags.has(tagName)) {
      continue; // Comments, end tags and ordinary elements (including attributes).
    }
    if (tagName === "plaintext") break;

    const endTag = new RegExp(`</${tagName}\\s*>`, "gi");
    endTag.lastIndex = match.index + match[0].length;
    const closing = endTag.exec(html);
    if (!closing) break; // The rest of the document is raw-text content.

    if (tagName === "style" && hasEmotionAttribute(match[3] ?? "")) {
      cleanedHtml += html.slice(cursor, match.index);
      css += html.slice(match.index + match[0].length, closing.index);
      cursor = endTag.lastIndex;
    }

    // Skip the entire raw-text element (including fake tags within its text).
    htmlTagPattern.lastIndex = endTag.lastIndex;
  }

  return { html: cleanedHtml + html.slice(cursor), css };
};

export interface CompileOptions {
  /**
   * Whether to use Emotion CSS.
   *
   * In browsers, CSS collection mounts a detached React root so Emotion's
   * insertion effects run. Components' mount and cleanup effects may also run.
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

  let Element = (
    <>
      <CSS>{printStyles}</CSS>
      {node}
    </>
  );

  const tailwindCollector = createTailwindStyleCollector();

  if (!emotion) {
    const html = renderToString(
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

  let renderedHtml: string;
  let cachedEmotionCss: string;

  if (styleContainer) {
    // Emotion's browser build inserts styles from React insertion effects,
    // which renderToString() never executes. Render into a detached root so
    // both class styles and <Global /> rules reach this isolated cache.
    /* v8 ignore next -- @preserve */
    const [{ createRoot }, { flushSync }] = await Promise.all([
      import("react-dom/client"),
      import("react-dom"),
    ]);
    const host = document.createElement("div");
    let hasUncaughtError = false;
    let uncaughtError: unknown;
    const root = createRoot(host, {
      // React 19 reports uncaught render errors through the root callback
      // instead of necessarily throwing them from flushSync().
      onUncaughtError(error) {
        hasUncaughtError = true;
        uncaughtError = error;
      },
    });

    try {
      flushSync(() => root.render(Element));
      if (hasUncaughtError) {
        throw uncaughtError;
      }
      renderedHtml = host.innerHTML;
      // Read styles before unmount: Emotion's <Global /> cleanup removes its
      // separate stylesheet during the unmount insertion effect.
      cachedEmotionCss = Array.from(
        styleContainer.querySelectorAll<HTMLStyleElement>(
          "style[data-emotion]",
        ),
        (style) => style.textContent ?? "",
      ).join("");
    } finally {
      flushSync(() => root.unmount());
    }
  } else {
    renderedHtml = renderToString(Element);
    cachedEmotionCss = Object.values(cache.inserted)
      .filter((value): value is string => typeof value === "string")
      .join("");
  }

  const resolvedHtml = await tailwindCollector.resolve(renderedHtml);
  const { html, css: inlineEmotionCss } = extractEmotionStyleTags(resolvedHtml);

  cache.sheet.flush();

  const mergedStylesheet = `${inlineEmotionCss}${cachedEmotionCss}`;

  /* v8 ignore next -- @preserve */
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
              <ChakraProvider value={defaultSystem}>
                <Button colorPalette="blue">Hello</Button>
              </ChakraProvider>
            </>
          ),
          name: "Emotion CSS",
          compileOptions: {
            emotion: true,
          },
          externalImports: [
            `import { Button, ChakraProvider, defaultSystem } from "@chakra-ui/react";`,
          ],
        },
      },
    },
  },
};
