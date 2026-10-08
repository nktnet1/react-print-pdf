import { parseReleaseVersion } from "#scripts/release-policy.ts";

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
  if (published.includes(base)) {
    throw new Error(
      `${base} is already released; choose a newer --base version`,
    );
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
