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
    expect(() =>
      validateReleaseTrigger({
        eventName: "push",
        refName: "v1.2.3-beta.1",
        refType: "tag",
        version: "1.2.3-beta.1",
      }),
    ).toThrow(/workflow_dispatch/);
  });

  test("reserves workflow dispatch for beta versions", () => {
    expect(
      validateReleaseTrigger({
        eventName: "workflow_dispatch",
        refName: "main",
        refType: "branch",
        version: "1.2.3-beta.1",
      }).distTag,
    ).toBe("beta");
    expect(() =>
      validateReleaseTrigger({
        eventName: "workflow_dispatch",
        refName: "main",
        refType: "branch",
        version: "1.2.3",
      }),
    ).toThrow(/stable releases require/);
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
});
