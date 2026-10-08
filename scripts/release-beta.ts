import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { nextBetaVersion } from "#scripts/beta-version";
import { RELEASE_PACKAGE_NAME, releaseTag } from "#scripts/release-policy";

const { values } = parseArgs({
  options: {
    publish: { type: "boolean", default: false },
    base: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const root = resolve(import.meta.dirname, "..");

const run = (
  command: string,
  args: string[],
  options: { capture?: boolean } = {},
): string => {
  if (options.capture) {
    return execFileSync(command, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  }

  execFileSync(command, args, { cwd: root, stdio: "inherit" });
  return "";
};

const publishedVersions = async (): Promise<string[]> => {
  const response = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(RELEASE_PACKAGE_NAME)}`,
    { headers: { accept: "application/json" } },
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(
      `Failed to read ${RELEASE_PACKAGE_NAME} versions from npm: ${response.status} ${response.statusText}`,
    );
  }

  const metadata = (await response.json()) as {
    versions?: Record<string, unknown>;
  };
  return Object.keys(metadata.versions ?? {});
};

const main = async (): Promise<void> => {
  if (values.help) {
    console.log(`Usage: pnpm release:beta [--base <version>] [--dry-run | --publish]

Default: continue the current beta series, update package.json, and run release checks.
--base: choose the stable base for a new beta series, for example 0.2.0 or v0.2.0.
        A base is required when package.json currently contains a stable version.
--dry-run: show the next beta version without modifying files.
--publish: commit package.json on main, push main, then push a matching beta tag.

Stable releases do not use this script. Set package.json to the desired stable
version, commit it, create an annotated vX.Y.Z tag, and push the tag.`);
    return;
  }
  if (values.publish && values["dry-run"]) {
    throw new Error("Choose either --publish or --dry-run");
  }

  const git = (args: string[]): string => run("git", args, { capture: true });
  if (git(["status", "--porcelain"])) {
    throw new Error(
      "Commit or stash existing changes before preparing a beta release",
    );
  }

  const branch = git(["symbolic-ref", "--short", "HEAD"]);
  if (values.publish && branch !== "main") {
    throw new Error("Beta publishing requires the main branch");
  }

  const manifestPath = resolve(root, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    name?: unknown;
    version?: unknown;
    [key: string]: unknown;
  };
  if (
    manifest.name !== RELEASE_PACKAGE_NAME ||
    typeof manifest.version !== "string"
  ) {
    throw new Error(`Expected package.json name to be ${RELEASE_PACKAGE_NAME}`);
  }

  const version = nextBetaVersion(
    manifest.version,
    await publishedVersions(),
    values.base,
  );
  console.log(`${manifest.version} -> ${version} (npm tag: beta)`);
  if (values["dry-run"]) return;

  const tag = releaseTag(version);
  if (values.publish) {
    if (git(["tag", "--list", tag])) {
      throw new Error(`Release tag ${tag} already exists locally`);
    }
    if (git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) {
      throw new Error(`Release tag ${tag} already exists on origin`);
    }
  }

  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const check of ["check", "typecheck", "test"]) {
    run("pnpm", [check]);
  }

  if (!values.publish) {
    console.log(
      `Prepared ${version}. Review package.json and commit it when ready.`,
    );
    return;
  }

  const status = git(["status", "--porcelain"]);
  if (status !== " M package.json" && status !== "M package.json") {
    throw new Error(
      "Expected only package.json to change during beta preparation; review the worktree before publishing",
    );
  }
  const currentManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    version?: unknown;
  };
  if (currentManifest.version !== version) {
    throw new Error("Package version changed during validation");
  }

  git(["add", "--", "package.json"]);
  git(["commit", "--no-verify", "-m", version]);
  run("git", ["push", "origin", "HEAD:refs/heads/main"]);
  run("git", ["tag", "-a", tag, "-m", tag]);
  run("git", ["push", "origin", `refs/tags/${tag}`]);

  console.log(
    `Pushed ${tag}. After Pipeline passes on main, Release will publish ${RELEASE_PACKAGE_NAME}@${version} with the beta dist-tag.`,
  );
};

await main();
