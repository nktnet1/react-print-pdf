# Releases

Only tagged commits can publish to npm. The `Pipeline` workflow runs checks on
pushes to `main` and pull requests targeting `main`. A `v*` tag starts the
separate `Release` workflow, which requires a successful **main push** Pipeline
run for the exact tagged commit before npm publishing is allowed. Passing a
pull request alone is not enough. Release never increments `package.json`; it
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
other versions of `react-print-pdf` already exist; package-name existence alone
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
machine-readable checks; complete the browser challenge and enable npm's
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

Stable releases are tag-driven. Set `package.json` to the exact stable version,
commit it, then create and push a matching annotated tag:

```sh
git tag -a v0.2.0 -m v0.2.0
git push origin v0.2.0
```

The release workflow validates that the tag is exactly `v${package.version}`
and publishes stable versions with the `latest` npm dist-tag. Both stable and
beta tags must point to a commit reachable from `main` with a successful
Pipeline run for that **exact SHA** triggered by a push to `main`. When the tag
is pushed before that Pipeline run finishes, Release waits for the result;
failed, cancelled, missing, or timed-out runs cannot publish. The Release job
has npm OIDC access only after this gate passes.

Direct `npm publish` from a local checkout is blocked by `prepublishOnly`.

## Documentation verification

The `Documentation Verification` workflow checks maintained docgen tests and
compiles the existing documentation site when relevant sources change. It does
**not** enforce generated-page freshness on every PR while older checked-in MDX
pages remain stale.

Use the workflow's **Run workflow** action for a full regeneration check. Its
`cold_cache` input defaults to `true`, removing cached previews in the CI
checkout so every PDF/JPEG preview is rendered again. The manual job runs
`pnpm docs:verify`, which regenerates the pages, compiles the documentation
site, checks for obsolete `@fileforge/react-print` imports and missing/empty
preview assets, then compares generated MDX/metadata with `HEAD`. PDF/JPEG
bytes are deliberately excluded from the freshness comparison.

`docs:verify` **writes generated documentation and preview assets** into its
working tree. Run it in a disposable checkout when you only want a report. The
freshness check will fail until the regenerated MDX/metadata changes have been
reviewed and committed by the maintainer. Do not enable it as a required PR
status before completing that one-time regeneration; normal CI still checks
the maintained examples and existing site build.

The documentation site has its own `docs/package.json` and
`docs/pnpm-lock.yaml`. CI installs both the root and site dependencies with
`--frozen-lockfile`, without generating or committing a lockfile.
