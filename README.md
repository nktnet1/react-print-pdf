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
```

See [`docs/content/docs/contributing.mdx`](docs/content/docs/contributing.mdx) for the contribution workflow.

## License

See [LICENSE.md](LICENSE.md).
