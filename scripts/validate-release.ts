import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASE_PACKAGE_NAME, validateReleaseTrigger } from "./release-policy";

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
) as { name?: unknown; version?: unknown };

if (
  manifest.name !== RELEASE_PACKAGE_NAME ||
  typeof manifest.version !== "string"
) {
  throw new Error(`Expected package.json name to be ${RELEASE_PACKAGE_NAME}`);
}

const release = validateReleaseTrigger({
  eventName: process.env.GITHUB_EVENT_NAME,
  refName: process.env.GITHUB_REF_NAME,
  refType: process.env.GITHUB_REF_TYPE,
  version: manifest.version,
});

const output = `version=${release.version}\ndist-tag=${release.distTag}\n`;
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, output);
} else {
  process.stdout.write(output);
}
