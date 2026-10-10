# React Print PDF - Engineering handover for the next GPT session

> Maintainer-only handover, prepared after incremental patch `v1.0.28-consumer-markdown-tailwind-types.patch`.
> This handover document is introduced by `v1.0.29-handover-next-session.patch`.
> The `v1.0.x` numbers label incremental audit patches, **not** the npm package version.

## 1. Establish the correct baseline

- Project: `react-print-pdf`, an open-source React/TypeScript library for compiling printable documents to HTML, with optional PDF rendering integrations. This is not a hosted PDF API.
- The original supplied Git bundle identified commit `7c93d37dbfde720bfe04959d62fa83eca8b299fa`. **It is historical, not the current patched baseline.**
- The working baseline for follow-up changes is the repository **after patches v1.0.1 through v1.0.28**, with this handover as v1.0.29. Previous patches are assumed applied. Obtain a *fresh bundle of the current branch* in the next session where possible; do not silently restart from the original October 9 bundle.
- `package.json` was at npm version `0.1.151-beta.1` at this handover; re-check it against the next bundle before relying on that version.
- Public package subpaths in `package.json`: `react-print-pdf`, `react-print-pdf/client`, `react-print-pdf/mdx`, `react-print-pdf/playwright`, and exported `react-print-pdf/dist/*.css`.
- Consumer React and React DOM are peers supporting React 18.3.1+ or 19. Playwright is an optional peer. Both ESM and CJS builds and declarations are intentionally supported.

Do not assume a passing unit suite proves the installed npm package works. Several past bugs affected only published types, extracted styles, React 18, or isolated consumers.

## 2. What has already been addressed

The prior incremental patches (v1.0.1-v1.0.28) included fixes and regression tests in these areas:

- HTML compilation and Emotion extraction: leading comments, raw-text and attribute parsing, complete-document structure, React 18 document-root styles, Suspense fallbacks, and missing Web Crypto in some SSR environments.
- Tailwind: HTML class collection, per-region theme/Preflight isolation, unique scope identifiers, keyframes and `@font-face` isolation, shorthand font parsing, CSS variable handling, and preview-cache normalization.
- Print-oriented components: margins and page-counter validation, running-heading resets and prefixes/suffixes, footnote classes, and standard HTML/ARIA props on footnotes and page-variable components.
- Consumer packaging: React peer dependencies and React 18/19 compatibility, TypeScript value exports and consumer props, KaTeX CSS/font embedding and deduplication, ESM/CJS entrypoints, and Verdaccio fixture expectations.
- Tooling and release safety: offline artifact path/rollback protection, beta version downgrade guards, template/documentation corrections, and explicit source coverage enforcement.

These are **previous-session findings**, not a fresh guarantee that all integrations or the latest branch are green. Consult the patches or current source when a specific behavior matters; avoid speculative re-fixes.

## 3. Verified facts and still-unverified work

### Confirmed from the repository at handover

- `pnpm test:coverage` is defined in `package.json` and runs combined Node + Chromium Vitest coverage, then `scripts/check-source-coverage.ts`, then `test:package`. See `vitest.config.ts` and `config/vitest.coverage.ts`.
- The configured source coverage thresholds are **100%** for statements, branches, functions, and lines. The exclusion list in `vitest.config.ts` deliberately removes declaration files, `src/docgen/**`, and re-export-only entrypoints. Do not confuse this measured-source gate with proof of all runtime behavior.
- `pnpm test:package` builds and checks actual ESM/CJS artifacts, consumer imports/types, and packaging. The last reported v1.0.28 run passed 16/16 package tests, five TypeScript projects, Biome, and the ESM/CJS build; its affected source subset passed 61/61. These counts are historical results, **not a newly run full suite**.
- The last reported completely green combined 100% coverage run was around v1.0.15. Coverage thresholds were hardened in v1.0.16; a full browser-inclusive coverage run has **not** been confirmed against every later patch through v1.0.28.
- `docs/content/docs` contains generated component/template MDX pages. As of the v1.0.28 snapshot, **29 MDX files still reference `@fileforge/react-print`** and some contain outdated upstream examples. The generator (`docgen/buildFileMarkdown.ts` and `docgen/buildExample.tsx`) already uses `react-print-pdf` in maintained source.

### Outstanding acceptance work (prioritized)

1. **Documentation regeneration and consistency.** Review maintained examples in `src/**/__docConfig`, `src/ui/**/*.mdx`, and `docgen/**`; verify generated output would no longer contain stale imports and claims. `pnpm build-components-commit` and `pnpm docs:build` are the relevant scripts, but component preview generation needs Chromium and Poppler. The user's instruction is **do not hand-edit or include generated files in patches**; leave regeneration to the maintainer or obtain explicit permission for a generated-output-only update.
2. **Full current-branch coverage and CI gate.** Run the actual `pnpm test:coverage` with its Node + browser prerequisites when this scope is authorized, not just a focused Vitest subset. Diagnose failures and runner stalls instead of reporting a partial run as passed. Confirm the 100% gate on the exact code under review.
3. **Installed-package release acceptance.** Run a complete `pnpm test:verdaccio` publish/install workflow when the environment permits; v1.0.20 corrected an earlier missing-React-version fixture failure, but that full live workflow was not subsequently confirmed. Include React 18/19, type declarations, and ESM/CJS consumers.
4. **Dependency-lockfile consistency.** Earlier checks warned about a `package.json`/`pnpm-lock.yaml` mismatch after dependency changes. CI uses `pnpm install --frozen-lockfile`. The maintainer will regenerate the lockfile; **do not modify `pnpm-lock.yaml`** as part of AI patches.
5. **Vitest execution reliability.** Several previous full-suite runs stalled during or after the run in this environment, while smaller source/package groups passed. Record timeouts and logs accurately; do not label a non-terminating command green.
6. **Renderer-specific limitations / deferred work.** Chromium does not implement the paged-media CSS needed for repeated `PageTop`/`PageBottom`, running headings, or page-bottom footnotes. This is documented in `README.md`, not fixed by existing patches. Real Gotenberg and Bun integration have also been deliberately excluded from recent audits. Do not run or claim these are fixed unless the user reopens their scope.

## 4. Key paths for follow-up work

| Area | Primary paths |
| --- | --- |
| Package contract and commands | `package.json`, `README.md`, `config/tsdown.config.ts` |
| Public exports | `src/index.ts`, `src/client.ts`, `src/mdx.ts`, `src/playwright/index.ts` |
| Rendering/SSR | `src/compile/`, `src/html/`, `src/tailwind/`, `src/markdown/`, `src/latex/` |
| Document components | `src/variables/`, `src/shell/`, `src/footnote/`, `src/css/`, `src/signature/` |
| Package-consumer tests | `tests/package/`, `tests/fixtures/package-consumer/` |
| Source and coverage configs | `vitest.config.ts`, `config/vitest.node.config.ts`, `config/vitest.browser.config.ts`, `config/vitest.coverage.ts`, `scripts/check-source-coverage.ts` |
| Release and Verdaccio | `scripts/test-verdaccio.ts`, `scripts/verdaccio-consumer-dependencies.ts`, `scripts/RELEASING.md`, `.github/workflows/` |
| Maintained doc sources | `src/ui/`, `docgen/`, `docs/content/docs/getting-started/`, `docs/content/docs/integrations/` |
| Generated component/template docs | `docs/content/docs/components/`, `docs/content/docs/ui/templates/` |

## 5. Working and verification rules for the next session

- Audit **consumer-observable behavior** first: actual published entrypoints, React 18 and 19, TypeScript ESM/CJS consumers, HTML output, and documented examples. Prefer a reproducing test on the pre-fix baseline before writing a fix.
- Use the attached dependency archives when available. In Chat mode **do not install dependencies**. If prerequisites are missing, say so; do not invent a passing result.
- Before typechecks or returning a patch, run **Biome `check --write` using the attached Biome binary**. Inspect the diff afterward and exclude unrelated formatting.
- Use `pnpm typecheck`, `pnpm test:package`, and applicable focused Node tests. When the user authorizes a full release verification, run `pnpm test:coverage` and report all four metrics; the Node and Chromium projects are combined in that command. Separately report anything skipped or stalled.
- Do **not** modify `pnpm-lock.yaml`, `dist/`, `coverage/`, generated MDX documentation, or other generated assets. Package-manifest changes are allowed, but the maintainer updates lockfiles.
- Every source fix should include meaningful regression tests; do not inflate coverage with tests of unreachable behavior or exclude real code to reach 100%.
- Each deliverable is **one new incremental patch**, next version **v1.0.30**, assuming v1.0.29 and all earlier patches are applied. Use `v1.0.30-description.patch` naming, increase the patch number on future turns, and verify the patch against the immediate predecessor. Do not include patch-application instructions.
- The user prefers **only the patch artifact**, plus a concise description of verified changes, test outcomes, remaining gaps, a short dot-point summary, and a `git commit -m "fix: ..."` or equivalent command in a code block.
- Do not promise background work or a future delivery. If a test cannot be run, report it precisely and ship only what has been verified.

## 6. Suggested next-session order of operations

1. Obtain/inspect a current bundle reflecting v1.0.29, confirm `git status`, `package.json`, and the main-branch revision. Do not assume the original bundle reflects the accumulated patches.
2. Investigate whether the **maintained** documentation and public API still disagree, without editing generated output. Reproduce a real consumer error before proposing another API patch.
3. Validate `pnpm test:package`, TypeScript consumers, and the frozen-lockfile risk; then run the combined coverage/CI check only if renderer tests are in scope.
4. If all permitted checks pass and no new defect is reproducible, **say so and do not manufacture a patch**. Instead provide the concrete release-readiness findings.

## 7. Copy/paste prompt for the next GPT session

```text
Continue work on react-print-pdf from my current main-branch bundle. The cumulative
fixes v1.0.1-v1.0.28 and handover patch v1.0.29 are assumed applied. Read
MAINTAINER_HANDOVER.md first and verify the latest code state; do not reuse the
original 7c93d37 commit as the current baseline.

Prioritize real consumer-facing defects and release readiness, not coverage
percentages alone. Investigate remaining generated-documentation discrepancies,
published ESM/CJS + React 18/19 TypeScript consumers, Verdaccio integration,
test-runner stability, and the current coverage gate. Keep Bun, Gotenberg, and
Chromium-specific feature investigations excluded unless I explicitly reopen
them; distinguish checks that intrinsically require Chromium, such as the
combined test:coverage command.

Use the supplied dependencies without installing new ones in Chat mode. Run the
attached Biome binary with check --write before typechecking or creating a
patch. Do not modify generated files or pnpm-lock.yaml. Reproduce bugs and add
regression tests. Return only a verified incremental v1.0.30-*.patch if a real
fix is warranted, followed by a brief dot-point summary and a git commit -m
command. Do not provide patch-application instructions. If no new issue can be
confirmed, report what passed and what remains unverified instead.
```
