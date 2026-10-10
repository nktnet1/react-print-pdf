/** Wrap HTML fragments, but preserve complete documents after leading comments. */
export const toHtmlDocument = (html: string): string => {
  // Comments may legally precede the doctype or root <html> element. Checking
  // only the first tag mistakenly wraps those documents in a second document.
  const firstMarkup = html.trimStart().replace(/^(?:<!--[\s\S]*?-->\s*)+/, "");

  if (
    /^<!doctype\s+html/i.test(firstMarkup) ||
    /^<html(?:\s|>)/i.test(firstMarkup)
  ) {
    return html;
  }

  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
};

// React 18 emits style elements and Tailwind region markers *outside* the
// <html> root when that root is wrapped in <Tailwind>. Keep the boundaries
// around the actual body content instead: @scope needs the markers to remain
// siblings of their target elements, and styles belong in the document head.
const styleTag = String.raw`<style(?=[\s>])[^>]*>[\s\S]*?<\/style\s*>\s*`;
const startTag = String.raw`<template\s+data-react-print-tailwind-start="[^"]+"\s*><\/template>\s*`;
const endTag = String.raw`<template\s+data-react-print-tailwind-end="[^"]+"\s*><\/template>\s*`;
const leadingDocumentParts = new RegExp(
  `^((?:${styleTag}|${startTag})+)(<html(?=[\\s>])[\\s\\S]*<\\/html>)((?:${endTag})*)$`,
  "i",
);
const startMarkerPattern =
  /<template\s+data-react-print-tailwind-start="([^"]+)"\s*><\/template>\s*/gi;
const endMarkerPattern =
  /<template\s+data-react-print-tailwind-end="([^"]+)"\s*><\/template>\s*/gi;

/**
 * React 18 serialises sibling <style> nodes before a complete <html> root,
 * even when the document is rendered as a single React fragment. Styles must
 * live inside the head, not ahead of its root element. React 19 already moves
 * styles and Tailwind boundaries into the document; leave it unchanged.
 */
export const moveCompiledStylesIntoDocument = (html: string): string => {
  const match = leadingDocumentParts.exec(html);
  if (!match) return html;

  const [, leading, document, trailing] = match;
  const starts = [...leading.matchAll(startMarkerPattern)];
  const ends = [...trailing.matchAll(endMarkerPattern)];

  // Do not silently reshape malformed scope pairs. The collector validates
  // markers when compiling, but this helper also accepts arbitrary HTML.
  if (
    starts.length !== ends.length ||
    starts.some((start, i) => start[1] !== ends[ends.length - 1 - i]?.[1])
  ) {
    return html;
  }

  const styles = leading.replace(startMarkerPattern, "");
  const headOpening = /<head(?=[\s>])[^>]*>/i;
  const withStyles = headOpening.test(document)
    ? document.replace(headOpening, (head) => `${head}${styles}`)
    : document.replace(
        /^<html(?=[\s>])[^>]*>/i,
        (opening) => `${opening}<head>${styles}</head>`,
      );

  if (starts.length === 0) return withStyles;

  const bodyOpening = /<body(?=[\s>])[^>]*>/i;
  if (!bodyOpening.test(withStyles) || !/<\/body\s*>/i.test(withStyles)) {
    throw new Error(
      "A Tailwind-wrapped <html> document must contain a <body> element",
    );
  }

  return withStyles
    .replace(
      bodyOpening,
      (body) => `${body}${starts.map((m) => m[0]).join("")}`,
    )
    .replace(
      /<\/body\s*>/i,
      (body) => `${ends.map((m) => m[0]).join("")}${body}`,
    );
};
