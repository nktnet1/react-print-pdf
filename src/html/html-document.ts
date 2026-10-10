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

/**
 * React 18 serialises sibling <style> nodes before a complete <html> root,
 * even when the document is rendered as a single React fragment. Those styles
 * must live inside the document, not ahead of its root element. React 19
 * already places them inside the document; leave that output unchanged.
 */
export const moveCompiledStylesIntoDocument = (html: string): string => {
  const match =
    /^((?:<style(?=[\s>])[^>]*>[\s\S]*?<\/style\s*>\s*)+)(<html(?=[\s>])[\s\S]*)$/i.exec(
      html,
    );
  if (!match) return html;

  const [, styles, document] = match;
  const headOpening = /<head(?=[\s>])[^>]*>/i;
  if (headOpening.test(document)) {
    return document.replace(headOpening, (head) => `${head}${styles}`);
  }

  // <head> is optional in HTML, but print styles need an explicit place to
  // live rather than becoming siblings of <html> or <body>.
  return document.replace(
    /^<html(?=[\s>])[^>]*>/i,
    (opening) => `${opening}<head>${styles}</head>`,
  );
};
