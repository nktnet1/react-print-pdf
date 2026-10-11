# Releases

Only tagged commits can publish to npm. The `Pipeline` workflow runs checks on
pushes to `main` and pull requests targeting `main`. A `v*` tag starts the
separate `Release` workflow, which requires a successful **main push** Pipeline
run for the exact tagged commit before npm publishing is allowed. Passing a
pull request alone is not enough. Release never increments `package.json`. It
publishes exactly the version committed in Git.

## Bootstrap npm trusted publishing

The release workflow publishes with GitHub Actions OIDC and does not use an
`NPM_TOKEN`. npm requires a package to exist before a trusted publisher can be
configured, so initial setup is deliberately split into two maintainer-only
steps.

First publish the fixed bootstrap version:

```sh
pnpm bootstrap:package
pnpm bootstrap:package --publish
```

The first command is a non-mutating check. With `--publish`, the script checks
for the exact `react-print-pdf@0.0.0-bootstrap.0` version and publishes it under
the `bootstrap` dist-tag when that version is missing. It does this even when
other versions of `react-print-pdf` already exist. Package-name existence alone
is not enough to prove that the bootstrap step was completed. The temporary
bootstrap package has no lifecycle scripts and does not modify the committed
`package.json`.

After the bootstrap publish succeeds, configure npm OIDC separately:

```sh
pnpm setup:oidc
```

`setup:oidc` refuses to start the trust flow until the fixed bootstrap version
is visible on the npm registry. It then configures `npm trust github` for
`nktnet1/react-print-pdf`, `release.yaml`, and the `Production` GitHub
environment with direct `npm publish` permission, and verifies the resulting
trust configuration.

The OIDC setup requires npm 11.15.0 or newer, package write access, and npm
account 2FA. Run `npm login --auth-type=web` first if `npm whoami` does not
succeed. `npm trust` does not accept a bypass-2FA granular token by itself. The
setup therefore performs an interactive `npm trust list` before its
machine-readable checks. Complete the browser challenge and enable npm's
**skip 2FA for the next 5 minutes** option so the remaining trust operations can
finish. TOTP users can instead provide `NPM_CONFIG_OTP`.

If an existing trusted publisher points somewhere else, inspect it first and
then use `pnpm setup:oidc --replace` only when you intend to revoke and replace
that configuration. npm requires a newly created trusted publisher to complete
its first successful OIDC publish within two days.

## Beta releases

Start from a clean checkout. When `package.json` contains a stable version,
choose the next stable base explicitly:

```sh
pnpm release:beta --base 0.2.0 --dry-run
pnpm release:beta --base 0.2.0 --publish
```

After the first beta, the base can be omitted to continue the same series:

```sh
pnpm release:beta --publish
```

The script selects the next unused `-beta.N` version from the npm registry,
runs the repository checks, commits only `package.json` on `main`, pushes the
commit, then creates and pushes an annotated `vX.Y.Z-beta.N` tag. The tag
triggers `Release`, which waits for the exact commit's main Pipeline run to pass
and publishes using the `beta` npm dist-tag. `--publish` requires a clean local
`main` branch with push access.

## Stable releases

From a clean, up-to-date `main` checkout, use `pnpm version patch` to graduate
an existing beta to stable. For example, when `package.json` is at
`0.1.151-beta.2`, `pnpm version patch` produces `0.1.151` (not `0.1.152`).
First commit all other changes and synchronize `pnpm-lock.yaml` with the
manifest, since CI installs with `--frozen-lockfile`. Confirm that the target
stable version is not already published to npm: npm versions are immutable.

```sh
git switch main
git pull --ff-only
git status --short # Must be empty
npm view react-print-pdf@0.1.151 version # Expect not found
pnpm version patch
git push origin main
# Wait for the main Pipeline to pass for the version commit.
git push origin v0.1.151
```

`pnpm version patch` creates both the version commit and its annotated
`vX.Y.Z` tag locally by default; do **not** create an extra commit or tag.
Only push the tag after the Pipeline passes for that exact commit. After
Release succeeds, verify `npm view react-print-pdf dist-tags --json` reports
the published version under `latest`. For later stable patch releases (when
`package.json` is already stable), the same command advances the patch number,
e.g. `0.1.151` to `0.1.152`. Update the tag in the example to match the
actual version.

The release workflow validates that the tag is exactly `v${package.version}`
and publishes stable versions with the `latest` npm dist-tag. Both stable and
beta tags must point to a commit reachable from `main` with a successful
Pipeline run for that **exact SHA** triggered by a push to `main`. Failed,
cancelled, missing, or timed-out runs cannot publish. The Release job has npm
OIDC access only after this gate passes.

Direct `npm publish` from a local checkout is blocked by `prepublishOnly`.

## Documentation verification

The `Documentation Verification` workflow checks maintained docgen tests,
validates committed generated pages and referenced preview assets, and compiles
the documentation site when relevant sources change. This fast check rejects
obsolete package imports and missing previews without regenerating PDFs.

Use the workflow's **Run workflow** action for a full regeneration check. Its
`cold_cache` input defaults to `true`, removing cached previews in the CI
checkout so every PDF/JPEG preview is rendered again. The manual job runs
`pnpm docs:verify`, which regenerates the pages, compiles the documentation
site, checks for obsolete `@fileforge/react-print` imports and missing/empty
preview assets, then compares generated MDX/metadata with `HEAD`. PDF/JPEG
bytes are deliberately excluded from the freshness comparison.
The generator removes obsolete template pages before writing replacements, and
the verifier checks that each maintained UI template has exactly one matching
generated MDX page (excluding the separate UI landing page).

`docs:verify` **writes generated documentation and preview assets** into its
working tree. Run it in a disposable checkout when you only want a report. When generation changes MDX or metadata, review and commit those changes
before requiring the freshness check to pass. Normal CI checks the committed
pages, preview assets, maintained examples, and documentation site build.

The documentation site has its own `docs/package.json` and
`docs/pnpm-lock.yaml`. CI installs both the root and site dependencies with
`--frozen-lockfile`, without generating or committing a lockfile.
