# React Print PDF

Open-source React and TypeScript components for building printable documents and renderer-ready HTML.

> **Fork note:** This project is a fork of `OnedocLabs/react-print-pdf`, originally developed by the Fileforge team. This fork intentionally contains only the FOSS component library and does not include a hosted server, API, or document service.

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

React Print PDF uses the **React and React DOM versions supplied by your application**. Both packages are peer dependencies; React 18.3.1+ and React 19 are supported. If you are starting a standalone Node.js document generator rather than using an existing React application, install them explicitly:

```sh
npm install react-print-pdf react@^19 react-dom@^19
```

Keeping one matching React/React DOM pair avoids rendering errors caused by multiple React versions in the same application.

## Example

```tsx
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

`compile()` returns HTML and print styles. React Print PDF does not require or bundle a hosted PDF service; pass the HTML to whichever local or remote PDF renderer fits your application.

**Using components directly in a browser:** If you render components such as `PageBreak`, `NoBreak`, or `PageTop` without calling `compile()`, import the packaged print stylesheet in your application's client entrypoint:

```tsx
import "react-print-pdf/dist/index.css";
import { PageBreak } from "react-print-pdf/client";
```

The build extracts these component rules to `dist/index.css`, so the JavaScript entrypoint alone does not load them. `compile()` inlines the same print styles automatically; do not add the stylesheet separately to compiled documents.

### Gotenberg

For a self-hosted PDF renderer, React Print PDF includes a Gotenberg integration that compiles the React document and submits the resulting HTML to Gotenberg's Chromium route:

```tsx
import { compileWithGotenberg } from "react-print-pdf";

const pdf = await compileWithGotenberg(<Document />, {
  baseUrl: "http://localhost:3000",
});
```

The helper returns a `Uint8Array`. It defaults to CSS page sizing, printed backgrounds, and PDF document outlines; all Gotenberg form fields can be overridden through `formFields`. See [`docs/content/docs/integrations/gotenberg.mdx`](docs/content/docs/integrations/gotenberg.mdx) for Docker and authentication examples.

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

Pass an existing Playwright `Browser` through the `browser` option to reuse Chromium across renders while keeping each document in an isolated browser context. See [`docs/content/docs/integrations/playwright.mdx`](docs/content/docs/integrations/playwright.mdx) for lifecycle, Next.js, and deployment examples.

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
Tailwind region isolation also relies on CSS `@scope`; make sure your chosen
PDF renderer supports that at-rule or its utilities may not apply.

## Components

The library includes utilities for:

- document compilation and custom CSS;
- page headers, footers, breaks, and no-break regions;
- page numbers and running headings;
- footnotes;
- Markdown and LaTeX;
- Tailwind CSS;
- signature/form fields; and
- reusable document templates.

The source documentation lives under [`docs/content/docs`](docs/content/docs).

## Development

```sh
pnpm build
pnpm typecheck
pnpm check
pnpm test:source
pnpm test:coverage
pnpm test:package
pnpm test
```

`test:source` runs the Node and Chromium tests **directly from `src/`** using
Vitest projects, without a package build. The test configuration uses the same
Tailwind theme and Preflight CSS definitions as `tsdown`. The main
`vitest.config.ts` stays at the repository root for automatic discovery; its
supporting test configurations and the build configuration live under `config/`.
Internal tooling imports use the `#config/*` package subpath mapping.
`test:package` builds `dist/` and runs the separate Bun, Vercel,
export/declaration, and bundle
compatibility checks against the **actual published entrypoints**.
`test` runs both suites in that order.

`test:coverage` runs the source projects with combined V8 coverage, checks the
result once, then runs the published-package tests. Node and Chromium hits are
merged by Vitest into a single `coverage/combined/` report (HTML, LCOV, and
JSON summary); build artifacts and vendor runtime code do not count towards
source coverage. The post-run guard requires **100% statements, branches,
functions, and lines** across the measured `src/` files; it also rejects empty
source coverage. This is an aggregate gate, not a guarantee of compatibility
with every PDF renderer or React integration. CI uses this command on pull requests and
pushes to `main` and uploads the report. Export-only entrypoints may show 0%
coverage because they contain no executable logic; their published imports are
verified separately by `test:package`.

Chromium is required for the browser suite and PDF integration tests. Install
it with `pnpm exec playwright install chromium`; the PDF integration tests also
use Poppler's `pdfinfo` and `pdftotext` (`poppler-utils`). CI installs these
prerequisites. Documentation previews created by `pnpm build-components`
also use Poppler's `pdftoppm` to rasterize the first PDF page (on macOS,
`brew install poppler`). `test:source` does not build `dist/` or download
Chromium at every run.

The pre-commit hook runs the non-writing `check` command; it deliberately does
not regenerate documentation. To update generated component documentation,
run `pnpm build-components-commit` explicitly and commit the resulting MDX
pages **together with** any new preview PDFs and images they reference.

For a real Gotenberg integration check, run `pnpm test:gotenberg`. This
builds the distributable package, launches a disposable Chromium-only Gotenberg
container on a random **localhost-only** port, and validates its generated PDFs
using Poppler's `pdfinfo`, `pdftotext`, and `pdfimages`. It checks pagination,
page size, extracted text, and a separately uploaded PNG asset, then stops the
container. It requires a running Docker daemon and `poppler-utils`; it does not
run as part of the normal Vitest/coverage suite. To test an existing service
instead, set `GOTENBERG_BASE_URL` (this skips Docker startup); the default
image is `gotenberg/gotenberg:8.37.0-chromium` and can be overridden with
`GOTENBERG_IMAGE`. If the container exits during startup, the test reports its
exit status and logs before removing it. CI runs this integration check
in a separate job on `main` pushes, after the regular test job, not on PRs.

See [`docs/content/docs/contributing.mdx`](docs/content/docs/contributing.mdx) for the contribution workflow.

## License

See [LICENSE.md](LICENSE.md).
