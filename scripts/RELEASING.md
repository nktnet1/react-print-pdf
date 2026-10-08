# Releases

Release CI owns npm publication. It never increments `package.json` and it
publishes exactly the version committed in Git. Merge the release workflow to
the default branch before using `pnpm release:beta --publish`, because GitHub
requires a `workflow_dispatch` workflow to exist on the default branch.

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
