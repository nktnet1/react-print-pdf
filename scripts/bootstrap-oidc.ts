import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  RELEASE_ENVIRONMENT,
  RELEASE_GITHUB_REPOSITORY,
  RELEASE_PACKAGE_NAME,
  RELEASE_WORKFLOW_FILE,
} from "#scripts/release-policy.ts";

const BOOTSTRAP_VERSION = "0.0.0-bootstrap.0";
const BOOTSTRAP_TAG = "bootstrap";
const MINIMUM_NPM_VERSION = [11, 15, 0] as const;
const REGISTRY = "https://registry.npmjs.org";

const { values } = parseArgs({
  options: {
    publish: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
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
      stdio: ["inherit", "pipe", "inherit"],
    }).trim();
  }

  execFileSync(command, args, { cwd: root, stdio: "inherit" });
  return "";
};

const parseVersion = (version: string): number[] =>
  version
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10));

const requireModernNpm = (): void => {
  const version = run("npm", ["--version"], { capture: true });
  const actual = parseVersion(version);
  const supported = MINIMUM_NPM_VERSION.every((minimum, index) => {
    const current = actual[index] ?? 0;
    const previousEqual = MINIMUM_NPM_VERSION.slice(0, index).every(
      (value, previousIndex) => (actual[previousIndex] ?? 0) === value,
    );
    return !previousEqual || current >= minimum;
  });

  if (!supported) {
    throw new Error(
      `npm ${version} is too old for npm trust; install npm >= ${MINIMUM_NPM_VERSION.join(".")}`,
    );
  }
};

const repositoryFromManifest = (value: unknown): string | undefined => {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "url" in value
        ? (value as { url?: unknown }).url
        : undefined;
  if (typeof raw !== "string") return undefined;

  const normalized = raw
    .replace(/^git\+/, "")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== "github.com") return undefined;
    return url.pathname.replace(/^\//, "");
  } catch {
    return undefined;
  }
};

type TrustConfiguration = {
  id?: string;
  type?: string;
  claims?: {
    repository?: string;
    workflow_ref?: { file?: string };
    environment?: string;
  };
  permissions?: string[];
};

const isExpectedTrust = (configuration: TrustConfiguration): boolean =>
  configuration.type === "github" &&
  configuration.claims?.repository === RELEASE_GITHUB_REPOSITORY &&
  configuration.claims.workflow_ref?.file === RELEASE_WORKFLOW_FILE &&
  configuration.claims.environment === RELEASE_ENVIRONMENT &&
  configuration.permissions?.includes("createPackage") === true;

const packageExists = async (): Promise<boolean> => {
  const response = await fetch(
    `${REGISTRY}/${encodeURIComponent(RELEASE_PACKAGE_NAME)}`,
    { headers: { accept: "application/json" } },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Failed to read ${RELEASE_PACKAGE_NAME} from npm: ${response.status} ${response.statusText}`,
    );
  }
  return true;
};

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

const listTrust = (): TrustConfiguration[] => {
  const output = run(
    "npm",
    ["trust", "list", RELEASE_PACKAGE_NAME, "--registry", REGISTRY, "--json"],
    { capture: true },
  );
  const parsed = JSON.parse(output) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Unexpected response from npm trust list --json");
  }
  return parsed as TrustConfiguration[];
};

const createTrust = (): void => {
  run("npm", [
    "trust",
    "github",
    RELEASE_PACKAGE_NAME,
    "--file",
    RELEASE_WORKFLOW_FILE,
    "--repo",
    RELEASE_GITHUB_REPOSITORY,
    "--environment",
    RELEASE_ENVIRONMENT,
    "--allow-publish",
    "--registry",
    REGISTRY,
    "--yes",
  ]);
};

const main = async (): Promise<void> => {
  if (values.help) {
    console.log(`Usage: pnpm bootstrap:oidc [--publish] [--replace]

Default: validate the local release configuration and report the npm/OIDC setup
that would be performed without changing the registry.

--publish: if necessary, create ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} under
           the ${BOOTSTRAP_TAG} dist-tag, then configure npm trusted publishing.
--replace: with --publish, revoke existing non-matching trust configurations before
           creating the expected GitHub Actions publisher.

The trusted publisher is restricted to:
  repository:  ${RELEASE_GITHUB_REPOSITORY}
  workflow:    ${RELEASE_WORKFLOW_FILE}
  environment: ${RELEASE_ENVIRONMENT}`);
    return;
  }
  if (values.replace && !values.publish) {
    throw new Error("--replace requires --publish");
  }

  const manifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ) as { name?: unknown; repository?: unknown };
  if (manifest.name !== RELEASE_PACKAGE_NAME) {
    throw new Error(`Expected package.json name to be ${RELEASE_PACKAGE_NAME}`);
  }
  const repository = repositoryFromManifest(manifest.repository);
  if (repository?.toLowerCase() !== RELEASE_GITHUB_REPOSITORY.toLowerCase()) {
    throw new Error(
      `package.json repository must point to https://github.com/${RELEASE_GITHUB_REPOSITORY}.git for npm trusted publishing`,
    );
  }

  const workflowPath = resolve(
    root,
    ".github",
    "workflows",
    RELEASE_WORKFLOW_FILE,
  );
  const workflow = readFileSync(workflowPath, "utf8");
  if (!/id-token:\s*write/.test(workflow)) {
    throw new Error(`${RELEASE_WORKFLOW_FILE} must grant id-token: write`);
  }
  if (!new RegExp(`environment:\\s*${RELEASE_ENVIRONMENT}`).test(workflow)) {
    throw new Error(
      `${RELEASE_WORKFLOW_FILE} must publish through the ${RELEASE_ENVIRONMENT} environment`,
    );
  }

  requireModernNpm();
  const exists = await packageExists();

  console.log(`Package:     ${RELEASE_PACKAGE_NAME}`);
  console.log(`Repository:  ${RELEASE_GITHUB_REPOSITORY}`);
  console.log(`Workflow:    ${RELEASE_WORKFLOW_FILE}`);
  console.log(`Environment: ${RELEASE_ENVIRONMENT}`);
  console.log(
    `npm package: ${exists ? "already exists" : "needs bootstrap publish"}`,
  );

  if (!values.publish) {
    if (!exists) {
      console.log(
        `Would publish ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} with the ${BOOTSTRAP_TAG} dist-tag.`,
      );
    }
    console.log(
      "Would configure the GitHub Actions trusted publisher with npm publish permission.",
    );
    console.log("Run pnpm bootstrap:oidc --publish when ready.");
    return;
  }

  run("npm", ["whoami"]);

  if (!exists) {
    const directory = createBootstrapPackage();
    try {
      run("npm", [
        "publish",
        directory,
        "--registry",
        REGISTRY,
        "--access",
        "public",
        "--tag",
        BOOTSTRAP_TAG,
        "--ignore-scripts",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  const trust = listTrust();
  if (trust.some(isExpectedTrust)) {
    console.log("Trusted publisher is already configured correctly.");
    return;
  }

  if (trust.length > 0 && !values.replace) {
    const summary = trust
      .map((configuration) => {
        const claims = configuration.claims;
        return `${configuration.id ?? "unknown-id"}: ${configuration.type ?? "unknown"} ${claims?.repository ?? "unknown-repo"} ${claims?.workflow_ref?.file ?? "unknown-workflow"} ${claims?.environment ?? "no-environment"}`;
      })
      .join("\n  ");
    throw new Error(
      `Existing npm trusted publisher configuration does not match this repository:\n  ${summary}\nRun pnpm bootstrap:oidc --publish --replace to replace it.`,
    );
  }

  if (values.replace) {
    for (const configuration of trust) {
      if (!configuration.id) {
        throw new Error("Cannot replace a trusted publisher without an id");
      }
      run("npm", [
        "trust",
        "revoke",
        RELEASE_PACKAGE_NAME,
        "--id",
        configuration.id,
        "--registry",
        REGISTRY,
      ]);
    }
  }

  createTrust();
  const configured = listTrust();
  if (!configured.some(isExpectedTrust)) {
    throw new Error(
      "npm trusted publisher was created but could not be verified",
    );
  }

  console.log(
    `Configured npm OIDC publishing for ${RELEASE_PACKAGE_NAME}. Run a beta or stable release within two days to validate the new trust relationship.`,
  );
};

await main();
