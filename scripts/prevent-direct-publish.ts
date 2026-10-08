if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RELEASE_PUBLISH !== "1"
) {
  throw new Error(
    "Direct npm publishing is disabled. Publish releases by pushing a matching version tag (pnpm release:beta handles beta tags).",
  );
}
