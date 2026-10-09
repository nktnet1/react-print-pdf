/**
 * Tailwind CSS support for React Print PDF.
 *
 * Tailwind CSS v4 exposes an asynchronous compiler initialization step and a
 * synchronous `build()` step. React's string renderer is synchronous, so the
 * React Print PDF `compile()` helper collects Tailwind regions during render and
 * resolves their styles before returning the final HTML string.
 */

import isPseudoClass from "@csstools/postcss-is-pseudo-class";
import { decode } from "html-entities";
import postcss from "postcss";
import postcssColorFunctionalNotation from "postcss-color-functional-notation";
import selectorParser from "postcss-selector-parser";
import parseCssValue from "postcss-value-parser";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { type Config, compile as compileTailwind } from "tailwindcss";
import { CSS, escapeCss } from "#/css/css";
import type { DocConfig } from "#/docgen/types";

// Replaced with the Tailwind package's CSS text during tsdown compilation.
// Keeping these sources out of the CSS asset pipeline prevents ?raw imports
// from becoming empty stylesheets in the published server bundle.
declare const __REACT_PRINT_TAILWIND_THEME_CSS__: string;
declare const __REACT_PRINT_TAILWIND_PREFLIGHT_CSS__: string;

type LegacyCorePlugins = string[] | Record<string, boolean>;

type TailwindConfig = Config & {
  corePlugins?: LegacyCorePlugins;
  content?: unknown;
};

export type TailwindProps = {
  /**
   * The children of the Tailwind component. Components will have access to
   * generated Tailwind utility classes.
   */
  children: ReactNode;
  /**
   * A legacy JavaScript Tailwind config. Tailwind CSS v4 still supports JS
   * configuration through `@config`, but CSS-first configuration is preferred.
   *
   * Tailwind v4 no longer supports `corePlugins`; React Print PDF only reads the
   * legacy `corePlugins.preflight` value for backwards compatibility. The
   * `content` option is ignored because candidates are collected from the
   * rendered children automatically.
   */
  config?: TailwindConfig;
  /**
   * Tailwind CSS v4 configuration appended to the compiler input. Use this for
   * directives such as `@theme`, `@utility`, and `@custom-variant`.
   */
  stylesheet?: string;
  /**
   * Include Tailwind's Preflight reset. Defaults to true. This prop replaces
   * the v3 `corePlugins.preflight` configuration, which Tailwind v4 no longer
   * supports.
   */
  preflight?: boolean;
};

type TailwindCompileOptions = Omit<TailwindProps, "children">;

type TailwindStyleCollector = {
  register(options: TailwindCompileOptions): string;
  resolve(html: string): Promise<string>;
};

const TailwindStyleCollectorContext =
  createContext<TailwindStyleCollector | null>(null);

const VIRTUAL_CONFIG_ID = "react-print-tailwind-config";

function extractClassNames(markup: string) {
  const classNames = new Set<string>();
  const rawTextElements = new Set([
    "script",
    "style",
    "textarea",
    "title",
    "xmp",
    "iframe",
    "noembed",
    "noframes",
    "plaintext",
  ]);
  let position = 0;

  // React uses double quotes for regular JSX attributes, but
  // dangerouslySetInnerHTML can contain valid single-quoted or unquoted HTML.
  // Scan start tags rather than all text: comments, scripts and CSS often
  // contain examples like `class="bg-red-500"` that are not real elements.
  while (position < markup.length) {
    const opening = markup.indexOf("<", position);
    if (opening < 0) break;
    position = opening + 1;

    if (markup.startsWith("!--", position)) {
      const closing = markup.indexOf("-->", position + 3);
      if (closing < 0) break;
      position = closing + 3;
      continue;
    }
    if (markup[position] === "!" || markup[position] === "?") {
      const closing = markup.indexOf(">", position);
      if (closing < 0) break;
      position = closing + 1;
      continue;
    }

    const closingTag = markup[position] === "/";
    if (closingTag) position++;
    const tagStart = position;
    while (/[a-zA-Z0-9:-]/.test(markup[position] ?? "")) position++;
    if (position === tagStart) continue;
    const tagName = markup.slice(tagStart, position).toLowerCase();
    let selfClosing = false;

    while (position < markup.length) {
      while (/\s/.test(markup[position] ?? "")) position++;
      if (markup[position] === ">") {
        position++;
        break;
      }
      if (markup[position] === "/" && markup[position + 1] === ">") {
        position += 2;
        selfClosing = true;
        break;
      }
      if (position >= markup.length) break;

      const attributeStart = position;
      while (position < markup.length && !/[\s=/>]/.test(markup[position])) {
        position++;
      }
      if (position === attributeStart) {
        position++;
        continue;
      }
      const attribute = markup.slice(attributeStart, position).toLowerCase();
      while (/\s/.test(markup[position] ?? "")) position++;
      if (markup[position] !== "=") continue;
      position++;
      while (/\s/.test(markup[position] ?? "")) position++;

      let value: string;
      const quote = markup[position];
      if (quote === '"' || quote === "'") {
        const end = markup.indexOf(quote, position + 1);
        if (end < 0) {
          position = markup.length;
          break;
        }
        value = markup.slice(position + 1, end);
        position = end + 1;
      } else {
        const valueStart = position;
        while (position < markup.length && !/[\s>]/.test(markup[position])) {
          position++;
        }
        value = markup.slice(valueStart, position);
      }

      if (!closingTag && attribute === "class") {
        for (const className of decode(value).split(/\s+/)) {
          if (className) classNames.add(className);
        }
      }
    }

    // Raw-text and RCDATA elements can contain literal markup-like strings.
    // They are not children and must not be scanned as potential start tags.
    if (!closingTag && !selfClosing && rawTextElements.has(tagName)) {
      if (tagName === "plaintext") break;
      const closeTag = new RegExp(`</${tagName}(?=[\\s/>])`, "gi");
      closeTag.lastIndex = position;
      const match = closeTag.exec(markup);
      if (!match) break;
      position = match.index;
    }
  }

  return [...classNames];
}

/** @internal Collect candidates only between the mounted Tailwind boundaries. */
export function extractMountedClassNames(
  start: Element | null,
  end: Element | null,
): string[] {
  if (!start || !end) {
    throw new Error("Unable to locate direct Tailwind render boundaries.");
  }

  const classNames = new Set<string>();
  const include = (element: Element) => {
    for (const className of element.classList) {
      classNames.add(className);
    }
  };

  let sibling = start.nextSibling;
  while (sibling && sibling !== end) {
    if (sibling.nodeType === 1) {
      const element = sibling as Element;
      include(element);
      for (const descendant of element.querySelectorAll("[class]")) {
        include(descendant);
      }
    }
    sibling = sibling.nextSibling;
  }

  if (sibling !== end) {
    throw new Error("Unable to locate direct Tailwind render boundaries.");
  }

  return [...classNames];
}

function shouldIncludePreflight(
  config: TailwindConfig | undefined,
  preflight: boolean | undefined,
) {
  if (preflight !== undefined) {
    return preflight;
  }

  const corePlugins = config?.corePlugins;
  if (Array.isArray(corePlugins)) {
    return corePlugins.includes("preflight");
  }
  if (corePlugins && typeof corePlugins === "object") {
    return corePlugins.preflight !== false;
  }

  return true;
}

function getLegacyConfig(config: TailwindConfig | undefined): Config | null {
  if (!config) {
    return null;
  }

  const {
    content: _content,
    corePlugins: _corePlugins,
    ...legacyConfig
  } = config;

  return Object.keys(legacyConfig).length > 0 ? legacyConfig : null;
}

async function buildTailwindStyles(
  classNames: string[],
  { config, stylesheet, preflight }: TailwindCompileOptions,
) {
  const legacyConfig = getLegacyConfig(config);
  const includePreflight = shouldIncludePreflight(config, preflight);

  const input = [
    "@layer theme, base, components, utilities;",
    // Inline the bundled sources: the standalone Tailwind compiler does not
    // expand CSS imports itself, even when a loadStylesheet callback exists.
    __REACT_PRINT_TAILWIND_THEME_CSS__,
    includePreflight
      ? `@layer base {\n${__REACT_PRINT_TAILWIND_PREFLIGHT_CSS__}\n}`
      : "",
    "@tailwind utilities;",
    // Explicitly register rendered classes in the compiler input. This also
    // works when the bundled Tailwind runtime cannot discover source files.
    ...classNames.map(
      (className) => `@source inline(${JSON.stringify(className)});`,
    ),
    legacyConfig ? `@config "${VIRTUAL_CONFIG_ID}";` : "",
    stylesheet ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const compiler = await compileTailwind(input, {
    base: "/",
    loadStylesheet: async (id: string) => {
      throw new Error(`Unsupported Tailwind stylesheet import: ${id}`);
    },
    loadModule: async (id: string) => {
      if (id !== VIRTUAL_CONFIG_ID || !legacyConfig) {
        throw new Error(
          `Unsupported Tailwind module: ${id}. Pass plugins directly through the legacy config object instead of using @plugin.`,
        );
      }

      return {
        path: id,
        base: "/",
        module: legacyConfig,
      };
    },
  });

  const result = await postcss([
    isPseudoClass(),
    postcssColorFunctionalNotation(),
  ]).process(compiler.build(classNames), {
    from: undefined,
  });

  return result.css;
}

// Unquoted generic family names and CSS-wide keywords must retain their CSS
// meaning even if a document also declares @font-face { font-family: "serif" }.
// A custom font with such a name can still be selected by quoting it.
const genericFontFamilyKeywords = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// In the `font` shorthand the style, weight, stretch, size and line-height
// precede the family. Only family names after the size can be renamed: a font
// named "italic" must not alter `font: italic 16px Arial`, for example.
const fontShorthandFamilyOffset = (
  nodes: ReturnType<typeof parseCssValue>["nodes"],
): number => {
  const fontSizeKeyword =
    /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i;
  const fontSizeLength =
    /^(?:0(?:\.0+)?|(?:\d+(?:\.\d+)?|\.\d+)(?:%|[a-z]{1,7}))$/i;
  const literalSizeIndex = nodes.findIndex(
    (node) =>
      (node.type === "word" &&
        (fontSizeKeyword.test(node.value) ||
          fontSizeLength.test(node.value))) ||
      (node.type === "function" &&
        /^(?:calc|min|max|clamp)$/i.test(node.value)),
  );
  // A CSS variable may also supply the font size. When no literal size is
  // present, the last var() with a following token is the only candidate we
  // can distinguish from `font: var(--whole-shorthand)`.
  const sizeIndex =
    literalSizeIndex >= 0
      ? literalSizeIndex
      : nodes.findLastIndex(
          (node, index) =>
            node.type === "function" &&
            node.value.toLowerCase() === "var" &&
            nodes.slice(index + 1).some((part) => part.type !== "space"),
        );
  if (sizeIndex < 0) return Number.POSITIVE_INFINITY;

  let index = sizeIndex + 1;
  while (nodes[index]?.type === "space") index++;
  if (nodes[index]?.type === "div" && nodes[index].value === "/") {
    index++;
    while (nodes[index]?.type === "space") index++;
    // The token after `/` is the line-height, not a font family.
    if (nodes[index]?.type !== "word" && nodes[index]?.type !== "function") {
      return Number.POSITIVE_INFINITY;
    }
    index++;
  }
  while (nodes[index]?.type === "space") index++;
  return nodes[index]?.sourceIndex ?? Number.POSITIVE_INFINITY;
};

// The rendered children can have any valid HTML shape (including table rows or
// multiple roots), so a wrapper element would break layouts. In Chromium, @scope
// can instead use two inert template siblings as a region boundary. The CSS
// compiler's global theme variables must be placed on each scoped root rather
// than the document root, or sibling configurations overwrite one another.
function scopeTailwindStyles(css: string, registrationId: string): string {
  const root = postcss.parse(css);

  // @scope isolates selectors, but CSS animation names remain global. When two
  // regions define the same @keyframes name, the last definition wins for both.
  // Give every region its own names and update animation declarations (including
  // Tailwind's --animate-* variables) to use them. Encode the scope ID because
  // React's useId() values can contain characters invalid in CSS identifiers.
  const suffix = Array.from(new TextEncoder().encode(registrationId), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const keyframes = new Map<string, string>();
  root.walkAtRules((atRule) => {
    if (!/^(?:-webkit-)?keyframes$/i.test(atRule.name)) return;
    const name = atRule.params.trim();
    if (!name) return;
    const scopedName = `react-print-${suffix}-${name}`;
    keyframes.set(name, scopedName);
    atRule.params = scopedName;
  });

  // @font-face families are also document-global even when declared inside
  // @scope. Rename them with the same per-region prefix and update references
  // in Tailwind theme variables and CSS font declarations.
  const fontFamilies = new Map<string, string>();
  root.walkAtRules((atRule) => {
    if (!/^font-face$/i.test(atRule.name)) return;
    atRule.walkDecls(/^font-family$/i, (declaration) => {
      const parsed = parseCssValue(declaration.value);
      // CSS family names can be quoted or unquoted word sequences, e.g.
      // "My Font" and My Font. Ignore invalid/complex descriptor values.
      const nodes = parsed.nodes.filter((node) => node.type !== "comment");
      const original =
        nodes.length === 1 && nodes[0].type === "string"
          ? nodes[0].value
          : nodes.every((node) => node.type === "word" || node.type === "space")
            ? nodes
                .filter((node) => node.type === "word")
                .map((node) => node.value)
                .join(" ")
            : "";
      if (!original) return;
      const familyKey = original.toLowerCase();
      let scopedFamily = fontFamilies.get(familyKey);
      if (!scopedFamily) {
        scopedFamily = `react-print-${suffix}-font-${fontFamilies.size}`;
        fontFamilies.set(familyKey, scopedFamily);
      }
      declaration.value = `"${scopedFamily}"`;
    });
  });

  if (keyframes.size > 0 || fontFamilies.size > 0) {
    // An arbitrary custom property may contain a literal word that happens to
    // match a keyframe name (`--status: wiggle`, for example). Only rewrite
    // animation-related variables, following var() dependencies so custom
    // animation shorthands keep working without corrupting unrelated values.
    const animationVariables = new Set<string>();
    const fontFamilyVariables = new Set<string>();
    const variableReferences = new Map<string, Set<string>>();
    const references = (value: string, afterOffset = 0): Set<string> => {
      const found = new Set<string>();
      parseCssValue(value).walk((node) => {
        if (node.sourceIndex < afterOffset) return false;
        if (node.type !== "function" || node.value.toLowerCase() !== "var") {
          return;
        }
        const name = node.nodes.find((part) => part.type === "word")?.value;
        if (name?.startsWith("--")) found.add(name);
      });
      return found;
    };

    root.walkDecls((declaration) => {
      const property = declaration.prop;
      if (property.startsWith("--")) {
        if (property.startsWith("--animate-")) animationVariables.add(property);
        const previous = variableReferences.get(property) ?? new Set<string>();
        for (const name of references(declaration.value)) previous.add(name);
        variableReferences.set(property, previous);
      } else if (/^(?:-webkit-)?animation(?:-name)?$/i.test(property)) {
        for (const name of references(declaration.value)) {
          animationVariables.add(name);
        }
      } else if (/^font-family$/i.test(property)) {
        for (const name of references(declaration.value)) {
          fontFamilyVariables.add(name);
        }
      } else if (/^font$/i.test(property)) {
        const afterOffset = fontShorthandFamilyOffset(
          parseCssValue(declaration.value).nodes,
        );
        for (const name of references(declaration.value, afterOffset)) {
          fontFamilyVariables.add(name);
        }
      }
    });

    // Rewrite only variables used as animation/family values, plus any
    // transitively referenced aliases. A variable like `--font-style: italic`
    // used by font-style must not be changed merely because its name contains
    // "font" and a registered family also happens to be named "italic".
    const includeReferencedVariables = (variables: Set<string>) => {
      const pending = [...variables];
      for (let index = 0; index < pending.length; index++) {
        for (const name of variableReferences.get(pending[index]) ?? []) {
          if (!variables.has(name)) {
            variables.add(name);
            pending.push(name);
          }
        }
      }
    };
    includeReferencedVariables(animationVariables);
    includeReferencedVariables(fontFamilyVariables);

    root.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      const isAnimation = /^(?:-webkit-)?animation(?:-name)?$/.test(property);
      const isFont = property === "font" || property === "font-family";
      const isVariable = declaration.prop.startsWith("--");
      const isAnimationVariable =
        isVariable && animationVariables.has(declaration.prop);
      const isFontVariable =
        isVariable && fontFamilyVariables.has(declaration.prop);
      if (!isAnimation && !isFont && !isFontVariable && !isAnimationVariable)
        return;
      // @font-face family descriptors have already been renamed above.
      if (
        property === "font-family" &&
        declaration.parent &&
        "name" in declaration.parent &&
        typeof declaration.parent.name === "string" &&
        /^font-face$/i.test(declaration.parent.name)
      ) {
        return;
      }

      const parsedValue = parseCssValue(declaration.value);
      const familyOffset =
        property === "font" ? fontShorthandFamilyOffset(parsedValue.nodes) : 0;
      // Process multiword families before single identifiers. Otherwise a
      // registered one-word family can mask a longer family with that prefix.
      // In a `font` shorthand, style/size tokens may precede the family, so
      // search suffixes of each word run rather than matching only the run.
      if (isFont || isFontVariable) {
        const nodes = parsedValue.nodes;
        for (let index = 0; index < nodes.length; ) {
          if (
            nodes[index].type !== "word" ||
            nodes[index].sourceIndex < familyOffset
          ) {
            index++;
            continue;
          }
          let end = index + 1;
          while (
            nodes[end]?.type === "space" &&
            nodes[end + 1]?.type === "word"
          ) {
            end += 2;
          }

          const starts =
            property === "font"
              ? Array.from(
                  { length: (end - index + 1) / 2 },
                  (_, i) => index + i * 2,
                )
              : [index];
          let replaced = false;
          for (const start of starts) {
            const words = nodes
              .slice(start, end)
              .filter((node) => node.type === "word")
              .map((node) => node.value);
            if (words.length < 2) continue;
            const scopedFamily = fontFamilies.get(
              words.join(" ").toLowerCase(),
            );
            if (!scopedFamily) continue;
            nodes.splice(start, end - start, {
              type: "string",
              quote: '"',
              value: scopedFamily,
              sourceIndex: nodes[start].sourceIndex,
              sourceEndIndex: nodes[end - 1].sourceEndIndex,
            });
            index = start + 1;
            replaced = true;
            break;
          }
          if (!replaced) index = end;
        }
      }

      parsedValue.walk((node) => {
        if (isFont && node.sourceIndex < familyOffset) return false;
        // Do not rewrite URL contents or arbitrary quoted animation strings.
        if (node.type === "function" && node.value.toLowerCase() === "url") {
          return false;
        }
        if (node.type === "word") {
          if (isAnimation || isAnimationVariable) {
            node.value = keyframes.get(node.value) ?? node.value;
          }
          if (
            (isFont || isFontVariable) &&
            !genericFontFamilyKeywords.has(node.value.toLowerCase())
          ) {
            node.value =
              fontFamilies.get(node.value.toLowerCase()) ?? node.value;
          }
        } else if (node.type === "string" && (isFont || isFontVariable)) {
          node.value = fontFamilies.get(node.value.toLowerCase()) ?? node.value;
        }
      });

      declaration.value = parsedValue.toString();
    });
  }

  root.walkRules((rule) => {
    // @keyframes selectors are percentages, not element selectors.
    if (
      rule.parent?.type === "atrule" &&
      /keyframes$/i.test(rule.parent.name)
    ) {
      return;
    }

    const parsed = selectorParser().astSync(rule.selector);
    const scopedSelectors = parsed.nodes.flatMap((selector) => {
      const original = selector.toString();
      if ([":root", ":host", "html"].includes(original.trim())) {
        return [":scope"];
      }

      // Rules inside @scope target descendants but not the scope root. Match
      // both so direct children (including multiple sibling roots) still work.
      // Pseudo-elements cannot occur inside :is(), so keep their suffix out.
      const pseudoElementIndex = selector.nodes.findIndex(
        (part) => part.type === "pseudo" && part.value.startsWith("::"),
      );
      const base =
        pseudoElementIndex < 0
          ? original
          : selector.nodes
              .slice(0, pseudoElementIndex)
              .map((part) => part.toString())
              .join("");
      const pseudoElementSuffix =
        pseudoElementIndex < 0
          ? ""
          : selector.nodes
              .slice(pseudoElementIndex)
              .map((part) => part.toString())
              .join("");
      return [
        `:where(:scope):is(${base.trim() || "*"})${pseudoElementSuffix}`,
        original,
      ];
    });
    rule.selector = scopedSelectors.join(", ");
  });

  const start = `template[data-react-print-tailwind-start="${registrationId}"]`;
  const end = `template[data-react-print-tailwind-end="${registrationId}"]`;
  const scoped = postcss.atRule({
    name: "scope",
    params: `(:where(${start} ~ :not(${end} ~ *)))`,
  });
  scoped.append(root.nodes);
  return scoped.toString();
}

export function createTailwindStyleCollector(): TailwindStyleCollector {
  let id = 0;
  // Compiled fragments can be joined later, including fragments rendered by
  // separate servers. Per-collector zero-based IDs would then collide and let
  // the last fragment's theme override styles in earlier fragments.
  const collectorId = Array.from(
    globalThis.crypto.getRandomValues(new Uint8Array(16)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const registrations = new Map<string, TailwindCompileOptions>();

  return {
    register(options) {
      const registrationId = `react-print-tailwind-${collectorId}-${id++}`;
      registrations.set(registrationId, options);
      return registrationId;
    },
    async resolve(html) {
      let output = html;

      const compiledStyles = await Promise.all(
        [...registrations.entries()].map(async ([registrationId, options]) => {
          const startMarker = `<template data-react-print-tailwind-start="${registrationId}"></template>`;
          const endMarker = `<template data-react-print-tailwind-end="${registrationId}"></template>`;
          const start = html.indexOf(startMarker);
          const end = html.indexOf(endMarker, start + startMarker.length);

          if (start === -1 || end === -1) {
            throw new Error(
              `Unable to locate Tailwind render markers for ${registrationId}.`,
            );
          }

          const markup = html.slice(start + startMarker.length, end);
          const css = await buildTailwindStyles(
            extractClassNames(markup),
            options,
          );

          return {
            registrationId,
            css: scopeTailwindStyles(css, registrationId),
          };
        }),
      );

      for (const { registrationId, css } of compiledStyles) {
        output = output.replace(
          `<template data-react-print-tailwind-start="${registrationId}"></template>`,
          `<style>${escapeCss(css)}</style><template data-react-print-tailwind-start="${registrationId}"></template>`,
        );
      }

      return output;
    },
  };
}

export const TailwindStyleCollectorProvider = ({
  collector,
  children,
}: {
  collector: TailwindStyleCollector;
  children: ReactNode;
}) => (
  <TailwindStyleCollectorContext.Provider value={collector}>
    {children}
  </TailwindStyleCollectorContext.Provider>
);

export const Tailwind = ({
  children,
  config,
  stylesheet,
  preflight,
}: TailwindProps) => {
  const collector = useContext(TailwindStyleCollectorContext);
  const options = useMemo(
    () => ({ config, stylesheet, preflight }),
    [config, stylesheet, preflight],
  );

  const scopeId = useId();
  const startRef = useRef<HTMLTemplateElement>(null);
  const endRef = useRef<HTMLTemplateElement>(null);
  const [directRenderCss, setDirectRenderCss] = useState("");
  const [directRenderError, setDirectRenderError] = useState<Error | null>(
    null,
  );

  // The DOM observer detects changes from both parent-provided children and
  // child-local state. Recreating this effect for every new children element
  // would compile the same new class set twice: once from the observer and
  // once from the new effect. Only compiler option changes need a new effect.
  useEffect(() => {
    if (collector) {
      return;
    }

    let active = true;
    let generation = 0;
    let previousCandidates: string | undefined;
    setDirectRenderError(null);

    // Rendering children a second time here would bypass their context and
    // invoke hooks and render-time side effects again. Use the mounted DOM
    // between inert template boundaries instead. Unlike style markers, these
    // do not add empty stylesheets or expose internal marker attributes.
    const rebuildForMountedClasses = () => {
      let classNames: string[];
      try {
        classNames = extractMountedClassNames(startRef.current, endRef.current);
      } catch (error) {
        // Class discovery runs synchronously while this effect is active.
        // Cleanup disconnects the observer, so no stale callback can run.
        setDirectRenderError(
          error instanceof Error ? error : new Error(String(error)),
        );
        return;
      }

      const candidates = JSON.stringify(classNames);
      if (candidates === previousCandidates) {
        return;
      }
      previousCandidates = candidates;
      const currentGeneration = ++generation;

      void buildTailwindStyles(classNames, options).then(
        (css) => {
          if (active && currentGeneration === generation) {
            setDirectRenderCss(scopeTailwindStyles(css, scopeId));
          }
        },
        (error) => {
          if (active && currentGeneration === generation) {
            setDirectRenderError(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        },
      );
    };

    // Child state updates do not re-render Tailwind itself. Observe DOM class
    // changes and inserted/removed descendants so those utilities are built
    // too. Observe the parent to catch changes among multiple root siblings;
    // the collector still limits candidates to the two template boundaries.
    const observer = new MutationObserver(rebuildForMountedClasses);
    const boundaryParent = startRef.current?.parentNode;
    if (boundaryParent) {
      observer.observe(boundaryParent, {
        attributes: true,
        attributeFilter: ["class"],
        childList: true,
        subtree: true,
      });
    }
    rebuildForMountedClasses();

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [collector, options, scopeId]);

  if (directRenderError) {
    throw directRenderError;
  }

  if (collector) {
    const registrationId = collector.register(options);
    return (
      <>
        <template data-react-print-tailwind-start={registrationId} />
        {children}
        <template data-react-print-tailwind-end={registrationId} />
      </>
    );
  }

  return (
    <>
      <CSS>{directRenderCss}</CSS>
      <template ref={startRef} data-react-print-tailwind-start={scopeId} />
      {children}
      <template ref={endRef} data-react-print-tailwind-end={scopeId} />
    </>
  );
};

/** @internal */
export const __docConfig: DocConfig = {
  name: "Tailwind",
  icon: "WindIcon",
  description: `A simple, drop-in way to use Tailwind CSS v4 in your components.

Tailwind v4's CSS-first configuration is supported through the \`stylesheet\` prop. Legacy JavaScript configuration remains available through \`config\` for backwards compatibility. When rendering on the server, use React Print PDF's async \`compile()\` helper so Tailwind styles are resolved before the HTML is returned.`,
  components: {
    Tailwind: {
      client: true,
      server: true,
      examples: {
        default: {
          description:
            "Use a simple Tailwind tag to support Tailwind in your document.",
          template: (
            <Tailwind>
              <div className="rounded-2xl bg-gradient-to-tr from-blue-500 to-blue-700 p-12" />
              <p className="py-12 text-slate-800">
                This is a Tailwind component. All children of this component
                will have access to the Tailwind CSS classes.
              </p>
            </Tailwind>
          ),
        },
        stylesheet: {
          name: "Tailwind v4 CSS configuration",
          description:
            "Use Tailwind v4 directives such as `@theme`, `@utility`, and `@custom-variant` through the stylesheet prop.",
          template: (
            <Tailwind
              stylesheet={`@theme {
  --color-primary: #6484cf;
}`}
            >
              <div className="rounded-2xl bg-primary p-12" />
              <p className="py-12 text-slate-800">
                This component uses a CSS-first Tailwind v4 theme token.
              </p>
            </Tailwind>
          ),
        },
        config: {
          name: "Legacy JavaScript config",
          description:
            "Existing JavaScript theme configuration remains supported through Tailwind v4's compatibility layer.",
          template: (
            <Tailwind
              config={{
                theme: {
                  extend: {
                    colors: {
                      primary: "#6484cf",
                    },
                  },
                },
              }}
            >
              <div className="rounded-2xl bg-primary p-12" />
            </Tailwind>
          ),
        },
        preflight: {
          name: "Disable Preflight",
          description:
            "Set `preflight={false}` to omit Tailwind's Preflight reset.",
          template: (
            <Tailwind preflight={false}>
              <h1 className="text-2xl font-bold">Level 1 Header</h1>
              <p className="text-slate-800">
                Tailwind utilities remain available without the reset.
              </p>
            </Tailwind>
          ),
        },
      },
    },
  },
};
