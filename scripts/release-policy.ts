export const RELEASE_PACKAGE_NAME = "react-print-pdf";
export const RELEASE_GITHUB_REPOSITORY = "nktnet1/react-print-pdf";
export const RELEASE_WORKFLOW_FILE = "release.yaml";
export const RELEASE_ENVIRONMENT = "Production";

const versionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/;

export const parseReleaseVersion = (version: string) => {
  const match = versionPattern.exec(version);
  if (match?.[0] !== version) {
    throw new Error(`Invalid or unsupported release version: ${version}`);
  }

  return {
    version,
    base: `${match[1]}.${match[2]}.${match[3]}`,
    beta: match[4],
    distTag: match[4] === undefined ? "latest" : "beta",
  } as const;
};

export const releaseTag = (version: string): string =>
  `v${parseReleaseVersion(version).version}`;

export const validateReleaseTrigger = ({
  eventName,
  refName,
  refType,
  version,
}: {
  eventName: string | undefined;
  refName: string | undefined;
  refType: string | undefined;
  version: string;
}) => {
  const release = parseReleaseVersion(version);

  if (eventName !== "push" || refType !== "tag") {
    throw new Error("Releases require a matching Git tag push");
  }

  const expectedTag = releaseTag(release.version);
  if (refName !== expectedTag) {
    throw new Error(
      `Release tag ${String(refName)} does not match package version ${expectedTag}`,
    );
  }

  return release;
};
