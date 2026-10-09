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
source coverage. Minimum thresholds are 85% lines/statements, 80% functions,
and 70% branches (based on the measured source-test baseline). The post-run
guard rejects empty `src/` coverage. CI uses this command on pull requests and
pushes to `main` and uploads the report. Export-only entrypoints may show 0%
coverage because they contain no executable logic; their published imports are
verified separately by `test:package`.

Chromium is required for the browser suite and PDF integration tests. Install
it with `pnpm exec playwright install chromium`; the PDF integration tests also
use Poppler's `pdfinfo` and `pdftotext` (`poppler-utils`). CI installs these
prerequisites. `test:source` does not build `dist/` or download Chromium at
every run.

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
