# Development guide

This guide is for contributors and maintainers of `react-print-pdf`. For installation,
component usage, and renderer limitations, see the [README](README.md) and the
[documentation](docs/content/docs).

## Project setup

Use Node.js 24 and the pnpm version declared in `package.json`.

```sh
git clone https://github.com/nktnet1/react-print-pdf
cd react-print-pdf
pnpm install --frozen-lockfile
```

The documentation site has its own dependencies and lockfile:

```sh
pnpm --dir docs install --frozen-lockfile
pnpm dev
```

The development server serves the documentation site at `http://localhost:3000`.
Add library components under `src/` and their tests under `tests/`. Documentation
examples for components are maintained alongside the source in `__docConfig`.
Reusable document templates live under `src/ui/templates/`.

## Building and testing

```sh
pnpm check
pnpm typecheck
pnpm build
pnpm test:source
pnpm test:package
pnpm test:coverage
```

- `check` runs Biome formatting and lint checks without rewriting files.
- `typecheck` validates the library, documentation generator, tests, scripts, and tooling configurations.
- `build` produces ESM, CommonJS, declarations, and extracted print styles in `dist/`.
- `test:source` runs both groups in one Vitest invocation without first building a package.
- `test:package` builds the package and tests its published entrypoints and consumer compatibility.
- `test:coverage` combines Node and browser source coverage, enforces 100% statements, branches, functions, and lines for the configured source files, and runs package tests.

The Node source tests cover offline artifact safety checks on all platforms.
The archive-producing integration tests run only on Linux x64, where they can
verify genuine Linux artifacts; run the suite on a Linux x64 machine or CI to
exercise them. macOS and other platforms do not generate Linux archives using
platform-specific installed dependencies.

Browser and PDF integration tests require the Playwright-managed Chromium
revision. Installing or extracting `node_modules` does **not** install the
Playwright browser binary:

```sh
pnpm exec playwright install chromium
```

PDF inspection and documentation previews also require Poppler (`pdfinfo`,
`pdftotext`, `pdfimages`, `pdffonts`, and `pdftoppm`). On macOS, install it
with `brew install poppler`. The CI pipeline installs Chromium and Poppler
on Linux. A system Chromium executable is not necessarily an equivalent
replacement for Playwright's pinned browser: use the matching Playwright
browser before treating Chromium-specific failures as source regressions.

If pnpm reports `ERR_PNPM_OUTDATED_LOCKFILE` after dependencies change,
regenerate and commit `pnpm-lock.yaml` alongside the manifest changes
before running frozen installs or CI. Offline `node_modules` archives do not
resolve a manifest/lockfile mismatch.

For the optional Gotenberg integration suite, see `pnpm test:gotenberg` and
its Docker prerequisites.

## Updating documentation

Edit end-user guides in `docs/content/docs/`. Keep contributor and release
instructions in this file and [scripts/RELEASING.md](scripts/RELEASING.md),
not in the end-user documentation.

Generated component and template pages are produced from the maintained source.
After editing their inputs, explicitly regenerate pages and preview assets:

```sh
pnpm build-components-commit
pnpm docs:build
```

Review and commit the resulting MDX, navigation metadata, and referenced preview
images/PDFs together. The generator requires Playwright Chromium and Poppler.
`pnpm docs:verify` regenerates documentation, builds the docs site, and checks
that generated text matches committed files. Run it in a disposable checkout
when you only want a report. Normal documentation CI also checks the committed
pages and preview references without regenerating all PDFs.

## Contributing

Open an issue before starting a large or breaking change. For a pull request,
include tests covering the changed behaviour and any corresponding maintained
documentation. Run `pnpm check`, `pnpm typecheck`, and the relevant test suites.
Avoid editing generated documentation by hand. Regenerate it from its source.

## Release and maintenance

The [release guide](scripts/RELEASING.md) covers npm trusted publishing,
versioning, release tags, and documentation verification. Offline development
archives can be exported with the tooling described in
[scripts/OFFLINE_ARTIFACTS.md](scripts/OFFLINE_ARTIFACTS.md).

This repository is a fork of `OnedocLabs/react-print-pdf`, originally developed
by the Fileforge team. Preserve upstream attribution and the Apache 2.0 license
when redistributing or modifying the project.
