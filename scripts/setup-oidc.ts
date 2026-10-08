import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  BOOTSTRAP_VERSION,
  NPM_REGISTRY,
  packageVersionExists,
  repositoryRoot,
  run,
  validateReleaseManifest,
} from "#scripts/npm-release";
import {
  RELEASE_ENVIRONMENT,
  RELEASE_GITHUB_REPOSITORY,
  RELEASE_PACKAGE_NAME,
  RELEASE_WORKFLOW_FILE,
} from "#scripts/release-policy";

const MINIMUM_NPM_VERSION = [11, 15, 0] as const;

const { values } = parseArgs({
  options: {
    replace: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

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

type TrustConfiguration = {
  id?: string;
  type?: string;
  file?: string;
  repository?: string;
  environment?: string;
  claims?: {
    repository?: string;
    workflow_ref?: { file?: string };
    environment?: string;
  };
  permissions?: string[];
};

const trustRepository = (
  configuration: TrustConfiguration,
): string | undefined =>
  configuration.repository ?? configuration.claims?.repository;

const trustWorkflowFile = (
  configuration: TrustConfiguration,
): string | undefined =>
  configuration.file ?? configuration.claims?.workflow_ref?.file;

const trustEnvironment = (
  configuration: TrustConfiguration,
): string | undefined =>
  configuration.environment ?? configuration.claims?.environment;

const isExpectedTrust = (configuration: TrustConfiguration): boolean =>
  configuration.type === "github" &&
  trustRepository(configuration) === RELEASE_GITHUB_REPOSITORY &&
  trustWorkflowFile(configuration) === RELEASE_WORKFLOW_FILE &&
  trustEnvironment(configuration) === RELEASE_ENVIRONMENT &&
  configuration.permissions?.includes("createPackage") === true;

const isTrustConfiguration = (value: unknown): value is TrustConfiguration =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const commandOutput = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);

  const commandError = error as Error & {
    stdout?: string | Buffer | null;
    stderr?: string | Buffer | null;
  };
  return [commandError.message, commandError.stdout, commandError.stderr]
    .filter((value): value is string | Buffer => value != null)
    .map((value) => value.toString())
    .join("\n");
};

const hasConfiguredOtp = (): boolean =>
  Boolean(process.env.NPM_CONFIG_OTP ?? process.env.npm_config_otp);

const explainTrustFailure = (error: unknown): never => {
  const output = commandOutput(error);
  if (/\bEOTP\b/.test(output)) {
    throw new Error(
      'npm trust still requires 2FA. Re-run pnpm setup:oidc and enable "skip 2FA for the next 5 minutes" during the interactive browser challenge, or provide NPM_CONFIG_OTP.',
    );
  }
  if (/\bE404\b/.test(output)) {
    throw new Error(
      `npm trust cannot access ${RELEASE_PACKAGE_NAME}. Confirm pnpm bootstrap:package --publish completed successfully with the same npm account, then retry pnpm setup:oidc.`,
    );
  }
  if (/\bE(?:401|403)\b/.test(output)) {
    throw new Error(
      "npm trust rejected the current npm credentials or package permissions. Run npm login --auth-type=web with an account that has write access; bypass-2FA granular tokens are not accepted by npm trust.",
    );
  }
  throw error;
};

const primeTrustAuthentication = (): void => {
  if (hasConfiguredOtp()) return;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "npm trust requires interactive 2FA. Run pnpm setup:oidc in an interactive terminal or provide NPM_CONFIG_OTP.",
    );
  }

  console.log(
    'npm trust requires interactive 2FA. Complete the browser challenge and enable npm\'s "skip 2FA for the next 5 minutes" option so the remaining trust operations can finish.',
  );
  try {
    run("npm", [
      "trust",
      "list",
      RELEASE_PACKAGE_NAME,
      "--registry",
      NPM_REGISTRY,
    ]);
  } catch (error) {
    explainTrustFailure(error);
  }
};

const listTrust = (): TrustConfiguration[] => {
  let output = "";
  try {
    output = run(
      "npm",
      [
        "trust",
        "list",
        RELEASE_PACKAGE_NAME,
        "--registry",
        NPM_REGISTRY,
        "--json",
      ],
      { capture: true },
    );
  } catch (error) {
    explainTrustFailure(error);
  }

  // npm currently emits no stdout for an empty trust list even with --json.
  // Treat that as the registry's documented empty-array response.
  if (output === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (error) {
    throw new Error("Unexpected non-JSON response from npm trust list --json", {
      cause: error,
    });
  }

  const configurations = Array.isArray(parsed) ? parsed : [parsed];
  if (!configurations.every(isTrustConfiguration)) {
    throw new Error("Unexpected response from npm trust list --json");
  }
  return configurations;
};

const createTrust = (): void => {
  try {
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
      NPM_REGISTRY,
      "--yes",
    ]);
  } catch (error) {
    explainTrustFailure(error);
  }
};

const validateWorkflow = (): void => {
  const workflowPath = resolve(
    repositoryRoot,
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
};

const main = async (): Promise<void> => {
  if (values.help) {
    console.log(`Usage: pnpm setup:oidc [--replace]

Configure npm trusted publishing for the already-bootstrapped package.

--replace: revoke existing non-matching trust configurations before creating
           the expected GitHub Actions publisher.

Prerequisite:
  ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} must already be published by
  pnpm bootstrap:package --publish.

The trusted publisher is restricted to:
  repository:  ${RELEASE_GITHUB_REPOSITORY}
  workflow:    ${RELEASE_WORKFLOW_FILE}
  environment: ${RELEASE_ENVIRONMENT}`);
    return;
  }

  validateReleaseManifest();
  validateWorkflow();
  requireModernNpm();

  const bootstrapExists = await packageVersionExists(BOOTSTRAP_VERSION);

  console.log(`Package:     ${RELEASE_PACKAGE_NAME}`);
  console.log(`Repository:  ${RELEASE_GITHUB_REPOSITORY}`);
  console.log(`Workflow:    ${RELEASE_WORKFLOW_FILE}`);
  console.log(`Environment: ${RELEASE_ENVIRONMENT}`);
  console.log(
    `Bootstrap:   ${bootstrapExists ? `${BOOTSTRAP_VERSION} published` : "missing"}`,
  );

  if (!bootstrapExists) {
    throw new Error(
      `Bootstrap ${RELEASE_PACKAGE_NAME}@${BOOTSTRAP_VERSION} first with pnpm bootstrap:package --publish, then run pnpm setup:oidc.`,
    );
  }

  run("npm", ["whoami"]);
  primeTrustAuthentication();

  const trust = listTrust();
  if (trust.some(isExpectedTrust)) {
    console.log("Trusted publisher is already configured correctly.");
    return;
  }

  if (trust.length > 0 && !values.replace) {
    const summary = trust
      .map((configuration) => {
        return `${configuration.id ?? "unknown-id"}: ${configuration.type ?? "unknown"} ${trustRepository(configuration) ?? "unknown-repo"} ${trustWorkflowFile(configuration) ?? "unknown-workflow"} ${trustEnvironment(configuration) ?? "no-environment"}`;
      })
      .join("\n  ");
    throw new Error(
      `Existing npm trusted publisher configuration does not match this repository:\n  ${summary}\nRun pnpm setup:oidc --replace to replace it.`,
    );
  }

  if (values.replace) {
    for (const configuration of trust) {
      if (!configuration.id) {
        throw new Error("Cannot replace a trusted publisher without an id");
      }
      try {
        run("npm", [
          "trust",
          "revoke",
          RELEASE_PACKAGE_NAME,
          "--id",
          configuration.id,
          "--registry",
          NPM_REGISTRY,
        ]);
      } catch (error) {
        explainTrustFailure(error);
      }
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

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
