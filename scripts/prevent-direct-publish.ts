if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RELEASE_PUBLISH !== "1"
) {
  throw new Error(
    "Direct npm publishing is disabled. Use pnpm release:beta for beta releases or push a matching vX.Y.Z tag for a stable release.",
  );
}
