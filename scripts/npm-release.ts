import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RELEASE_GITHUB_REPOSITORY,
  RELEASE_PACKAGE_NAME,
} from "#scripts/release-policy.ts";

export const BOOTSTRAP_VERSION = "0.0.0-bootstrap.0";
export const BOOTSTRAP_TAG = "bootstrap";
export const NPM_REGISTRY = "https://registry.npmjs.org";
export const repositoryRoot = resolve(import.meta.dirname, "..");

export const run = (
  command: string,
  args: string[],
  options: { capture?: boolean } = {},
): string => {
  if (options.capture) {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["inherit", "pipe", "inherit"],
    }).trim();
  }

  execFileSync(command, args, { cwd: repositoryRoot, stdio: "inherit" });
  return "";
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

export const validateReleaseManifest = (): void => {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as { name?: unknown; repository?: unknown };
  if (manifest.name !== RELEASE_PACKAGE_NAME) {
    throw new Error(`Expected package.json name to be ${RELEASE_PACKAGE_NAME}`);
  }

  const repository = repositoryFromManifest(manifest.repository);
  if (repository?.toLowerCase() !== RELEASE_GITHUB_REPOSITORY.toLowerCase()) {
    throw new Error(
      `package.json repository must point to https://github.com/${RELEASE_GITHUB_REPOSITORY}.git for npm publishing`,
    );
  }
};

export const packageVersionExists = async (
  version: string,
): Promise<boolean> => {
  const response = await fetch(
    `${NPM_REGISTRY}/${encodeURIComponent(RELEASE_PACKAGE_NAME)}/${encodeURIComponent(version)}`,
    { headers: { accept: "application/json" } },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(
      `Failed to read ${RELEASE_PACKAGE_NAME}@${version} from npm: ${response.status} ${response.statusText}`,
    );
  }
  return true;
};
