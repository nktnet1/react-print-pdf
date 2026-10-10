import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { getVerdaccioConsumerDependencies } from "#scripts/verdaccio-consumer-dependencies";

const readManifest = () =>
  JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  };

describe("Verdaccio isolated-consumer dependency versions", () => {
  test("resolves React peers from devDependencies after the peer-dependency migration", () => {
    const manifest = readManifest();
    expect(manifest.dependencies.react).toBeUndefined();
    expect(manifest.peerDependencies.react).toBeDefined();
    expect(manifest.peerDependencies["react-dom"]).toBeDefined();
    expect(getVerdaccioConsumerDependencies(manifest)).toEqual([
      `react@${manifest.devDependencies.react}`,
      `react-dom@${manifest.devDependencies["react-dom"]}`,
      `@emotion/react@${manifest.dependencies["@emotion/react"]}`,
    ]);
  });

  test("requires React and React DOM to be explicitly configured for testing", () => {
    const manifest = readManifest();
    expect(() =>
      getVerdaccioConsumerDependencies({
        ...manifest,
        devDependencies: { ...manifest.devDependencies, react: "" },
      }),
    ).toThrow("Missing react consumer-test version in devDependencies");
    expect(() =>
      getVerdaccioConsumerDependencies({
        ...manifest,
        devDependencies: {
          ...manifest.devDependencies,
          "react-dom": "",
        },
      }),
    ).toThrow("Missing react-dom consumer-test version in devDependencies");
  });

  test("does not silently substitute a dev-only Emotion version", () => {
    const manifest = readManifest();
    expect(() =>
      getVerdaccioConsumerDependencies({
        ...manifest,
        dependencies: { ...manifest.dependencies, "@emotion/react": "" },
      }),
    ).toThrow("Missing @emotion/react consumer-test version in dependencies");
  });
});
