# React Print PDF

Open-source React and TypeScript components for building printable documents and renderer-ready HTML.

## Features

- Build printable documents with React components.
- Compile React templates to standalone HTML.
- Control page size, margins, headers, footers, page breaks, footnotes, and running values with paged-media CSS.
- Use Markdown, LaTeX, Tailwind CSS, and Emotion-based component libraries in document templates.
- Start from reusable invoice, receipt, report, and agreement templates.
- Render the generated HTML with the PDF engine or print workflow of your choice.

## Installation

```sh
npm install react-print-pdf
```

```sh
yarn add react-print-pdf
```

```sh
pnpm add react-print-pdf
```

React Print PDF uses the **React and React DOM versions supplied by your application**. Both packages are peer dependencies. React 18.3.1+ and React 19 are supported. If you are starting a standalone Node.js document generator rather than using an existing React application, install them explicitly:

```sh
npm install react-print-pdf react@^19 react-dom@^19
```

Keeping one matching React/React DOM pair avoids rendering errors caused by multiple React versions in the same application.

## Example

```tsx
import React from "react";
import { PageBottom, PageBreak, PageTop, compile } from "react-print-pdf";

const Document = () => (
  <main>
    <PageTop>Quarterly report</PageTop>
    <p>Page one</p>
    <PageBreak />
    <p>Page two</p>
    <PageBottom>Confidential</PageBottom>
  </main>
);

const html = await compile(<Document />);
```

`compile()` returns HTML and print styles. React Print PDF does not require or bundle a hosted PDF service. Pass the HTML to whichever local or remote PDF renderer fits your application.

### Separate compiler and component entry points

For applications that need independent server and UI dependencies, prefer the
separate entry points rather than the backwards-compatible mixed root export:

```tsx
import { compile } from "react-print-pdf/compiler";
import { Markdown } from "react-print-pdf/components";

const html = await compile(<Markdown># Quarterly report</Markdown>);
```

`react-print-pdf/components` exports only document components; it does not load
`react-dom/server`. `react-print-pdf/compiler` exports `compile()` and its
options type, deferring the actual renderer and Tailwind compiler until the
function is called. The older `react-print-pdf` and `react-print-pdf/client`
entry points remain available for existing consumers.

Importing the compiler is safe without executing a React context provider, but
**calling `compile()` still requires standard React DOM server rendering**, not
the React Server Components (`react-server`) runtime. Next.js route handlers
that bundle the renderer into their RSC graph may still need to externalize
`react-print-pdf` using `serverExternalPackages` for server-side compilation.

**Using components directly in a browser:** If you render components such as `PageBreak`, `NoBreak`, or `PageTop` without calling `compile()`, import the packaged print stylesheet in your application's client entrypoint:

```tsx
import "react-print-pdf/dist/index.css";
import { PageBreak } from "react-print-pdf/client";
```

The build extracts these component rules to `dist/index.css`, so the JavaScript entrypoint alone does not load them. `compile()` inlines the same print styles automatically. Do not add the stylesheet separately to compiled documents.

The `CSS` component accepts trusted stylesheet strings and escapes closing `</style>` sequences to keep them inside the HTML style element. It does **not** sanitise or validate arbitrary CSS. Do not interpolate untrusted user-provided CSS into a document.

### Legacy print styling

For backwards compatibility with Fileforge/Tailwind v3 PDF templates,
`<Tailwind>` keeps the old `gray-200` colour for borders without an explicit
colour. It also ignores numeric brightness utilities that did not exist in
Tailwind v3's default scale (for example, `brightness-70`). Tailwind v4 would
otherwise apply `filter: brightness(70%)`, causing Chromium to rasterize text
and making speaker names unsearchable in exported PDFs.

To use Tailwind v4's native border and brightness defaults instead:

```tsx
<Tailwind legacyPrintStyles={false}>{children}</Tailwind>
```

Explicit border colours, supported brightness utilities such as `brightness-75`,
and arbitrary-value utilities such as `brightness-[.7]` remain available in
both modes. This is a targeted compatibility setting, not a full Tailwind v3
compiler or a guarantee of pixel-identical output across Chromium versions.

### Gotenberg

For a self-hosted PDF renderer, React Print PDF includes a Gotenberg integration that compiles the React document and submits the resulting HTML to Gotenberg's Chromium route:

```tsx
import { compileWithGotenberg } from "react-print-pdf";

const pdf = await compileWithGotenberg(<Document />, {
  baseUrl: "http://localhost:3000",
});
```

The helper returns a `Uint8Array`. It defaults to CSS page sizing, printed backgrounds, and PDF document outlines. All Gotenberg form fields can be overridden through `formFields`. See the [Gotenberg integration guide](https://github.com/nktnet1/react-print-pdf/blob/main/docs/content/docs/integrations/gotenberg.mdx) for Docker and authentication examples.

### Playwright

For local/in-process Chromium rendering, install Playwright and use the optional server-only integration:

```sh
pnpm add playwright
pnpm exec playwright install chromium
```

```tsx
import { compileWithPlaywright } from "react-print-pdf/playwright";

const pdf = await compileWithPlaywright(<Document />);
```

Pass an existing Playwright `Browser` through the `browser` option to reuse Chromium across renders while keeping each document in an isolated browser context. See the [Playwright integration guide](https://github.com/nktnet1/react-print-pdf/blob/main/docs/content/docs/integrations/playwright.mdx) for lifecycle, Next.js, and deployment examples.

**Chromium paged-media limitations:** Both Playwright and Gotenberg's Chromium
route can print page breaks, page counters, and CSS `@page` sizes, but Chromium
does not implement the paged-media features used by `PageTop`, `PageBottom`,
`RunningH1`–`RunningH6`, and `Footnote` (`position: running()`, `element()`,
`string-set`, and `float: footnote`). These components still emit HTML, but
Chromium will not repeat headers/footers, populate running headings, or move
footnotes to the bottom of the page. Use a renderer that supports these CSS
features when a document requires them.

Custom Tailwind `@keyframes` and `@font-face` names are isolated per region.
Use Tailwind utility classes or CSS theme variables (such as
`animation: var(--animate-custom)`) to reference them. Hard-coded animation
names and font-family names in React inline `style` props are not rewritten.
Tailwind region isolation also relies on CSS `@scope`. Make sure your chosen
PDF renderer supports that at-rule or its utilities may not apply.

## Components

The library includes utilities for:

- document compilation and custom CSS
- page headers, footers, breaks, and no-break regions
- page numbers and running headings
- footnotes
- Markdown and LaTeX
- Tailwind CSS
- signature and form fields
- reusable document templates

See the [documentation](https://nktnet1.github.io/react-print-pdf/) for the setup guide, components, templates, and rendering integrations.

## Contributing

See the [development guide](https://github.com/nktnet1/react-print-pdf/blob/main/DEVELOPMENT.md) for contributing, local builds, tests, and documentation changes.

## License

See [LICENSE.md](LICENSE.md).
