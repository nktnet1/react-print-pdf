# Releases

Release CI owns npm publication. It never increments `package.json` and it
publishes exactly the version committed in Git. Merge the release workflow to
the default branch before using `pnpm release:beta --publish`, because GitHub
requires a `workflow_dispatch` workflow to exist on the default branch.

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
runs the repository checks, commits only `package.json`, pushes the current
branch, and dispatches `.github/workflows/release.yaml` through the GitHub CLI.
The workflow accepts `workflow_dispatch` only when `package.json` contains a
beta version and publishes it with the `beta` npm dist-tag.

`gh auth status` must succeed before `--publish` can modify the repository.

## Stable releases

Stable releases are tag-driven. Set `package.json` to the exact stable version,
commit it, then create and push a matching annotated tag:

```sh
git tag -a v0.2.0 -m v0.2.0
git push origin v0.2.0
```

The release workflow validates that the tag is exactly `v${package.version}`
and that the version has no prerelease suffix, then publishes it with the
`latest` npm dist-tag.

Direct `npm publish` from a local checkout is blocked by `prepublishOnly`.
