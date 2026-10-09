# Offline test artifacts

On **Linux x64**, from a clean and committed repository with dependencies and Playwright Chromium already installed:

```sh
node scripts/create-offline-artifacts.ts
```

Node.js 24 runs this TypeScript script directly; it does not require a package manager or a TypeScript loader. The command uses `git`, GNU `tar`, `zstd`, and GNU `split` already installed on the machine. It **does not** install packages or access the network. The optional `pnpm artifacts:offline` alias also works when your pnpm lockfile is in sync; use the direct Node command if pnpm would otherwise attempt an install. It writes into the Git-ignored `.tmp/offline-artifacts/` directory:

- `project.bundle` — all committed Git refs and their history; uncommitted edits are excluded.
- `node_modules-linux-x64.tar.zst` — installed dependencies, preserving pnpm symlinks.
- `playwright.part-00`, `playwright.part-01`, etc. — a compressed, split archive containing only the Chromium, Chromium Headless Shell, and FFmpeg revisions required by the installed Playwright version. The number of parts depends on the compressed size.
- `artifacts-manifest.json` — commit SHA, versions, archive sizes, and SHA-256 checksums for verifying uploads and the reconstructed browser archive.

Upload all outputs to the same ChatGPT Project to make them available to new chats. Node.js, pnpm, and Biome can be reused separately until their versions change. Bun, Docker, and Gotenberg aren't included.

## Options

```sh
node scripts/create-offline-artifacts.ts --out /path/to/export --part-size-mib 400
node scripts/create-offline-artifacts.ts --playwright-cache /path/to/ms-playwright
node scripts/create-offline-artifacts.ts --allow-dirty
```

The default Playwright cache location is `PLAYWRIGHT_BROWSERS_PATH` or `~/.cache/ms-playwright`. `--out` is relative to the repository root unless absolute. Use `--allow-dirty` only if you understand that Git bundles **cannot** include uncommitted changes. Existing managed outputs are replaced after successful generation, and outdated part files are removed; unrelated files in the output directory are left untouched.

To restore the browser cache on another Linux x64 machine, join the parts in numeric order before extracting:

```sh
cat playwright.part-* > playwright-linux-x64.tar.zst
mkdir -p "$HOME/.cache/ms-playwright"
tar --zstd -xf playwright-linux-x64.tar.zst -C "$HOME/.cache/ms-playwright"
```

`node_modules` should be extracted at the repository root (`tar --zstd -xf node_modules-linux-x64.tar.zst`). The archive is tied to the operating system, CPU architecture, dependency versions, and installed Node.js runtime; regenerate it when those change.
