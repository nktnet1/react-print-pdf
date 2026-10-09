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
