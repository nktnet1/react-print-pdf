import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  BOOTSTRAP_TAG,
  BOOTSTRAP_VERSION,
  NPM_REGISTRY,
  packageVersionExists,
  run,
  validateReleaseManifest,
} from "#scripts/npm-release.ts";
import {
  RELEASE_GITHUB_REPOSITORY,
  RELEASE_PACKAGE_NAME,
} from "#scripts/release-policy.ts";

const { values } = parseArgs({
  options: {
    publish: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

const createBootstrapPackage = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "react-print-pdf-bootstrap-"));
  writeFileSync(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: RELEASE_PACKAGE_NAME,
        version: BOOTSTRAP_VERSION,
        description: "Bootstrap package for npm trusted publishing setup",
        license: "ISC",
        repository: {
          type: "git",
          url: `https://github.com/${RELEASE_GITHUB_REPOSITORY}.git`,
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(directory, "README.md"),
    `# ${RELEASE_PACKAGE_NAME}\n\nBootstrap placeholder for npm trusted publishing.\n`,
  );
  return directory;
};

const main = async (): Promise<void> => {
  if (values.help) {
    console.log(`Usage: pnpm bootstrap:package [--publish]

Default: check whether the fixed bootstrap version already exists without
changing the npm registry.

--publish: publish ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} under the
           ${BOOTSTRAP_TAG} dist-tag when that exact version is missing.

This step only establishes the npm package/version needed before trusted
publishing can be configured. Run pnpm setup:oidc separately afterwards.`);
    return;
  }

  validateReleaseManifest();

  const exists = await packageVersionExists(BOOTSTRAP_VERSION);
  console.log(`Package:           ${RELEASE_PACKAGE_NAME}`);
  console.log(`Bootstrap version: ${BOOTSTRAP_VERSION}`);
  console.log(`Bootstrap tag:     ${BOOTSTRAP_TAG}`);
  console.log(
    `npm bootstrap:     ${exists ? "already published" : "needs publication"}`,
  );

  if (exists) {
    return;
  }

  if (!values.publish) {
    console.log(
      `Would publish ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} with the ${BOOTSTRAP_TAG} dist-tag.`,
    );
    console.log("Run pnpm bootstrap:package --publish when ready.");
    return;
  }

  run("npm", ["whoami"]);

  const directory = createBootstrapPackage();
  try {
    run("npm", [
      "publish",
      directory,
      "--registry",
      NPM_REGISTRY,
      "--access",
      "public",
      "--tag",
      BOOTSTRAP_TAG,
      "--ignore-scripts",
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  console.log(
    `Published ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION}. Next run pnpm setup:oidc.`,
  );
};

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
