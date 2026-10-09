import { describe, expect, test } from "vitest";
import { nextBetaVersion } from "#scripts/beta-version";
import {
  parseReleaseVersion,
  validateReleaseTrigger,
} from "#scripts/release-policy";

describe("release policy", () => {
  test("maps stable and beta versions to npm dist-tags", () => {
    expect(parseReleaseVersion("1.2.3").distTag).toBe("latest");
    expect(parseReleaseVersion("1.2.3-beta.4").distTag).toBe("beta");
    expect(() => parseReleaseVersion("1.2.3-rc.1")).toThrow();
  });

  test("requires matching stable tags", () => {
    expect(
      validateReleaseTrigger({
        eventName: "push",
        refName: "v1.2.3",
        refType: "tag",
        version: "1.2.3",
      }).distTag,
    ).toBe("latest");
    expect(() =>
      validateReleaseTrigger({
        eventName: "push",
        refName: "v1.2.4",
        refType: "tag",
        version: "1.2.3",
      }),
    ).toThrow(/does not match/);
  });

  test("publishes beta versions only from matching tags", () => {
    expect(
      validateReleaseTrigger({
        eventName: "push",
        refName: "v1.2.3-beta.1",
        refType: "tag",
        version: "1.2.3-beta.1",
      }).distTag,
    ).toBe("beta");
    expect(() =>
      validateReleaseTrigger({
        eventName: "push",
        refName: "v1.2.3-beta.2",
        refType: "tag",
        version: "1.2.3-beta.1",
      }),
    ).toThrow(/does not match/);
  });

  test("rejects branch pushes and manual dispatches", () => {
    expect(() =>
      validateReleaseTrigger({
        eventName: "push",
        refName: "main",
        refType: "branch",
        version: "1.2.3",
      }),
    ).toThrow(/matching Git tag/);
    expect(() =>
      validateReleaseTrigger({
        eventName: "workflow_dispatch",
        refName: "main",
        refType: "branch",
        version: "1.2.3-beta.1",
      }),
    ).toThrow(/matching Git tag/);
  });
});

describe("beta version selection", () => {
  test("starts and continues beta series without reusing published versions", () => {
    expect(nextBetaVersion("1.2.3", [], "1.3.0")).toBe("1.3.0-beta.1");
    expect(
      nextBetaVersion("1.3.0-beta.1", ["1.3.0-beta.1", "1.3.0-beta.2"]),
    ).toBe("1.3.0-beta.3");
  });

  test("requires an explicit base from a stable manifest", () => {
    expect(() => nextBetaVersion("1.2.3", [])).toThrow(/--base/);
    expect(() => nextBetaVersion("1.2.3", ["1.3.0"], "1.3.0")).toThrow(
      /already released/,
    );
  });

  test("rejects beta base downgrades and versions older than a published stable", () => {
    // A prerelease for an older stable version must never become the next beta.
    expect(() => nextBetaVersion("1.3.0", [], "1.2.9")).toThrow(/newer/);
    expect(() => nextBetaVersion("1.3.0", [], "1.3.0")).toThrow(/newer/);
    expect(() => nextBetaVersion("1.4.0-beta.3", [], "1.3.0")).toThrow(/newer/);
    expect(() =>
      nextBetaVersion("1.4.0-beta.3", ["1.5.0", "1.4.0-beta.3"]),
    ).toThrow(/published/);
  });

  test("allows advancing beta bases after current and published stable versions", () => {
    expect(nextBetaVersion("1.3.0", ["1.3.0"], "1.4.0")).toBe("1.4.0-beta.1");
    expect(nextBetaVersion("1.4.0-beta.3", ["1.3.0"], "1.5.0")).toBe(
      "1.5.0-beta.1",
    );
  });
});
