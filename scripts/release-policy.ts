export const RELEASE_PACKAGE_NAME = "react-print-pdf";

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

  if (eventName === "push") {
    if (refType !== "tag") {
      throw new Error("Stable releases must be triggered by a Git tag");
    }
    if (release.beta !== undefined) {
      throw new Error(
        "Beta releases must use workflow_dispatch via pnpm release:beta, not Git tags",
      );
    }
    const expectedTag = releaseTag(release.version);
    if (refName !== expectedTag) {
      throw new Error(
        `Release tag ${String(refName)} does not match package version ${expectedTag}`,
      );
    }
  } else if (eventName === "workflow_dispatch") {
    if (refType !== "branch") {
      throw new Error("Beta workflow dispatches must target a branch");
    }
    if (release.beta === undefined) {
      throw new Error(
        "workflow_dispatch is reserved for beta versions; stable releases require a matching vX.Y.Z tag",
      );
    }
  } else {
    throw new Error(`Unsupported release event: ${String(eventName)}`);
  }

  return release;
};
