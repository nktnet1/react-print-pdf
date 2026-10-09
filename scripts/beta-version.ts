import { parseReleaseVersion } from "#scripts/release-policy";

const normalizeRequestedBase = (requestedBase: string): string => {
  const normalized = requestedBase.startsWith("v")
    ? requestedBase.slice(1)
    : requestedBase;
  const parsed = parseReleaseVersion(normalized);
  if (parsed.beta !== undefined) {
    throw new Error(
      "Expected --base to be a stable version without a prerelease suffix",
    );
  }
  return parsed.base;
};

// Compare numeric SemVer components without losing precision for large values.
const compareBases = (left: string, right: string): number => {
  const leftParts = left.split(".").map(BigInt);
  const rightParts = right.split(".").map(BigInt);
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
};

export const nextBetaVersion = (
  current: string,
  published: string[],
  requestedBase?: string,
): string => {
  const currentRelease = parseReleaseVersion(current);
  const base =
    requestedBase === undefined
      ? currentRelease.beta === undefined
        ? undefined
        : currentRelease.base
      : normalizeRequestedBase(requestedBase);

  if (base === undefined) {
    throw new Error(
      "package.json is on a stable version; choose the next beta base explicitly with --base <version>",
    );
  }
  if (
    compareBases(base, currentRelease.base) < 0 ||
    (compareBases(base, currentRelease.base) === 0 &&
      currentRelease.beta === undefined)
  ) {
    throw new Error(
      `Beta base ${base} must be newer than the current ${current} release`,
    );
  }
  if (published.includes(base)) {
    throw new Error(
      `${base} is already released; choose a newer --base version`,
    );
  }
  for (const version of published) {
    let release: ReturnType<typeof parseReleaseVersion>;
    try {
      release = parseReleaseVersion(version);
    } catch {
      continue;
    }
    if (compareBases(release.base, base) > 0) {
      throw new Error(
        `Beta base ${base} is older than published version ${version}; choose a newer --base version`,
      );
    }
  }

  let highest = 0n;
  for (const version of [current, ...published]) {
    let parsed: ReturnType<typeof parseReleaseVersion>;
    try {
      parsed = parseReleaseVersion(version);
    } catch {
      continue;
    }
    if (parsed.base === base && parsed.beta !== undefined) {
      const number = BigInt(parsed.beta);
      if (number > highest) highest = number;
    }
  }

  return `${base}-beta.${highest + 1n}`;
};
