import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  createOfflineArtifacts,
  parseOfflineArtifactArgs,
  publishStagedArtifacts,
} from "../../scripts/create-offline-artifacts";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(): {
  root: string;
  repoRoot: string;
  cache: string;
  out: string;
  commit: string;
} {
  const root = mkdtempSync(join(tmpdir(), "print-pdf-offline-artifacts-test-"));
  tempRoots.push(root);
  const repoRoot = join(root, "repo");
  const cache = join(root, "browsers");
  const out = join(repoRoot, ".tmp", "offline-artifacts");
  mkdirSync(repoRoot);
  const write = (relative: string, contents: string): void => {
    const target = join(repoRoot, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  };

  write("package.json", '{"name":"fixture","version":"1.0.0"}\n');
  write(".gitignore", "node_modules/\n.tmp/\n");
  write("README.md", "Committed source\n");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoRoot });
  execFileSync("git", ["add", "."], { cwd: repoRoot });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "initial commit",
    ],
    { cwd: repoRoot },
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  write("node_modules/playwright/package.json", '{"version":"1.64.0"}\n');
  write("node_modules/playwright-core/package.json", '{"version":"1.64.0"}\n');
  write(
    "node_modules/playwright-core/browsers.json",
    JSON.stringify({
      browsers: [
        { name: "chromium", revision: "1248" },
        { name: "chromium-headless-shell", revision: "1248" },
        { name: "ffmpeg", revision: "1013" },
        { name: "firefox", revision: "1555" },
      ],
    }),
  );
  write("node_modules/.pnpm/sample/file.txt", "pnpm layout\n");
  symlinkSync(".pnpm/sample", join(repoRoot, "node_modules", "sample"), "dir");

  for (const browser of [
    "chromium-1248",
    "chromium_headless_shell-1248",
    "ffmpeg-1013",
    "firefox-1555",
  ]) {
    mkdirSync(join(cache, browser), { recursive: true });
    writeFileSync(join(cache, browser, "INSTALLATION_COMPLETE"), "");
  }
  // Force multiple parts even in the small integration test.
  writeFileSync(join(cache, "chromium-1248", "chrome"), randomBytes(2_200_000));
  writeFileSync(join(cache, "firefox-1555", "firefox"), "must not archive\n");

  return { root, repoRoot, cache, out, commit };
}

const archiveEntries = (path: string): string[] =>
  execFileSync("tar", ["-I", "zstd", "-tf", path], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");

test("offline artifact CLI parses paths and rejects invalid part sizes", () => {
  expect(
    parseOfflineArtifactArgs(
      ["--repo", "code", "--out", "exports", "--part-size-mib", "64"],
      "/tmp",
      {},
    ),
  ).toMatchObject({
    repoRoot: "/tmp/code",
    outputDir: "/tmp/code/exports",
    partSizeMiB: 64,
  });
  expect(parseOfflineArtifactArgs(["--help"])).toBeNull();
  expect(() => parseOfflineArtifactArgs(["--part-size-mib", "0"])).toThrow(
    "positive integer",
  );
  expect(() => parseOfflineArtifactArgs(["--part-size-mib", "2.5"])).toThrow(
    "positive integer",
  );
  expect(() =>
    parseOfflineArtifactArgs([], "/tmp", { PLAYWRIGHT_BROWSERS_PATH: "0" }),
  ).toThrow("--playwright-cache");
});

test("exports a verified Git bundle, pnpm symlinks, and only matching Chromium browser parts", async () => {
  const { repoRoot, cache, out, commit } = fixture();
  const options = {
    repoRoot,
    outputDir: out,
    playwrightCache: cache,
    partSizeMiB: 1,
  };
  const manifest = await createOfflineArtifacts(options);
  expect(manifest).toMatchObject({
    commit,
    dirtyWorktree: false,
    playwrightVersion: "1.64.0",
    chromiumRevision: "1248",
    partSizeMiB: 1,
  });
  expect(manifest.artifacts.playwrightParts.length).toBeGreaterThan(1);
  expect(manifest.artifacts.playwrightParts.map((part) => part.file)).toEqual(
    manifest.artifacts.playwrightParts.map(
      (_, index) => `playwright.part-${String(index).padStart(2, "0")}`,
    ),
  );
  for (const artifact of [
    manifest.artifacts.bundle,
    manifest.artifacts.dependencies,
    ...manifest.artifacts.playwrightParts,
  ]) {
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.bytes).toBeGreaterThan(0);
    expect(existsSync(join(out, artifact.file))).toBe(true);
  }
  const expectedManifest = JSON.parse(
    readFileSync(join(out, "artifacts-manifest.json"), "utf8"),
  );
  expect(expectedManifest).toEqual(manifest);
  expect(archiveEntries(join(out, "node_modules-linux-x64.tar.zst"))).toContain(
    "node_modules/sample",
  );
  expect(
    execFileSync(
      "tar",
      ["-I", "zstd", "-tvf", join(out, "node_modules-linux-x64.tar.zst")],
      {
        encoding: "utf8",
      },
    ),
  ).toContain("node_modules/sample -> .pnpm/sample");

  const combined = Buffer.concat(
    manifest.artifacts.playwrightParts.map((part) =>
      readFileSync(join(out, part.file)),
    ),
  );
  expect(createHash("sha256").update(combined).digest("hex")).toBe(
    manifest.artifacts.playwrightArchive.sha256,
  );
  const combinedPath = join(out, "rebuilt-playwright.tar.zst");
  writeFileSync(combinedPath, combined);
  const entries = archiveEntries(combinedPath).join("\n");
  expect(entries).toContain("chromium-1248/chrome");
  expect(entries).toContain(
    "chromium_headless_shell-1248/INSTALLATION_COMPLETE",
  );
  expect(entries).toContain("ffmpeg-1013/INSTALLATION_COMPLETE");
  expect(entries).not.toContain("firefox-1555");

  // Regeneration drops obsolete parts but leaves unrelated files alone.
  writeFileSync(join(out, "playwright.part-99"), "obsolete");
  writeFileSync(join(out, "keep.txt"), "untouched");
  await createOfflineArtifacts(options);
  expect(readdirSync(out)).not.toContain("playwright.part-99");
  expect(readFileSync(join(out, "keep.txt"), "utf8")).toBe("untouched");
  expect(
    readdirSync(out).some((file) =>
      file.startsWith(".offline-artifacts-backup-"),
    ),
  ).toBe(false);
});

test("refuses to silently omit uncommitted changes from the Git bundle", async () => {
  const { repoRoot, cache, out } = fixture();
  writeFileSync(join(repoRoot, "README.md"), "Not committed\n");
  const options = { repoRoot, outputDir: out, playwrightCache: cache };
  await expect(createOfflineArtifacts(options)).rejects.toThrow(
    "Working tree has uncommitted changes",
  );
  expect(existsSync(out)).toBe(false);

  const manifest = await createOfflineArtifacts({
    ...options,
    allowDirty: true,
  });
  expect(manifest.dirtyWorktree).toBe(true);
});

test("rejects missing browser revisions without replacing existing exports", async () => {
  const { repoRoot, cache, out } = fixture();
  const options = { repoRoot, outputDir: out, playwrightCache: cache };
  const manifest = await createOfflineArtifacts(options);
  rmSync(join(cache, "ffmpeg-1013"), { recursive: true });
  await expect(createOfflineArtifacts(options)).rejects.toThrow(
    "Missing Playwright browser directory",
  );
  expect(readFileSync(join(out, "artifacts-manifest.json"), "utf8")).toEqual(
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
});

test("rejects outputs nested under inputs to avoid self-archiving", async () => {
  const { repoRoot, cache } = fixture();
  await expect(
    createOfflineArtifacts({
      repoRoot,
      outputDir: join(repoRoot, "node_modules", "exports"),
      playwrightCache: cache,
    }),
  ).rejects.toThrow("Output directory cannot be inside");
  await expect(
    createOfflineArtifacts({
      repoRoot,
      outputDir: join(cache, "chromium-1248", "exports"),
      playwrightCache: cache,
    }),
  ).rejects.toThrow("Output directory cannot be inside");
});

test.each(["browser cache", "node_modules"])(
  "rejects export destinations aliased into %s",
  async (input) => {
    const { root, repoRoot, cache } = fixture();
    const target =
      input === "browser cache" ? cache : join(repoRoot, "node_modules");
    const alias = join(root, "input-alias");
    symlinkSync(target, alias, "dir");
    // Without the physical-path guard, browser preflight fails instead.
    rmSync(join(cache, "ffmpeg-1013"), { recursive: true });

    await expect(
      createOfflineArtifacts({
        repoRoot,
        outputDir: join(alias, "exports"),
        playwrightCache: cache,
      }),
    ).rejects.toThrow("Output directory cannot be inside");
    expect(existsSync(join(target, "exports"))).toBe(false);
  },
);

test("invalid existing artifact does not delete any earlier exports", async () => {
  const { repoRoot, cache, out } = fixture();
  const options = { repoRoot, outputDir: out, playwrightCache: cache };
  const manifest = await createOfflineArtifacts(options);
  const existingManifest = readFileSync(
    join(out, "artifacts-manifest.json"),
    "utf8",
  );
  const existingBundle = readFileSync(join(out, "project.bundle"));
  symlinkSync("unrelated.txt", join(out, "playwright.part-99"));

  await expect(createOfflineArtifacts(options)).rejects.toThrow(
    "Refusing to replace non-file artifact",
  );
  expect(readFileSync(join(out, "artifacts-manifest.json"), "utf8")).toBe(
    existingManifest,
  );
  expect(readFileSync(join(out, "project.bundle"))).toEqual(existingBundle);
  expect(manifest.commit).toBeDefined();
});

test("recovers all existing artifacts when publication fails midway", () => {
  const root = mkdtempSync(join(tmpdir(), "print-pdf-publish-test-"));
  tempRoots.push(root);
  const outputDir = join(root, "output");
  const staging = join(root, "staging");
  mkdirSync(outputDir);
  mkdirSync(staging);
  writeFileSync(join(outputDir, "artifacts-manifest.json"), "old-manifest");
  writeFileSync(join(outputDir, "project.bundle"), "old-bundle");
  writeFileSync(join(outputDir, "playwright.part-00"), "old-part");
  writeFileSync(join(outputDir, "keep.txt"), "untouched");
  writeFileSync(join(staging, "artifacts-manifest.json"), "new-manifest");
  writeFileSync(join(staging, "project.bundle"), "new-bundle");
  writeFileSync(join(staging, "playwright.part-00"), "new-part");

  let failed = false;
  const move = (source: string, destination: string) => {
    if (!failed && source === join(staging, "playwright.part-00")) {
      failed = true;
      throw new Error("simulated move failure");
    }
    renameSync(source, destination);
  };

  expect(() => publishStagedArtifacts(outputDir, staging, move)).toThrow(
    "simulated move failure",
  );
  expect(readFileSync(join(outputDir, "artifacts-manifest.json"), "utf8")).toBe(
    "old-manifest",
  );
  expect(readFileSync(join(outputDir, "project.bundle"), "utf8")).toBe(
    "old-bundle",
  );
  expect(readFileSync(join(outputDir, "playwright.part-00"), "utf8")).toBe(
    "old-part",
  );
  expect(readFileSync(join(outputDir, "keep.txt"), "utf8")).toBe("untouched");
  expect(readdirSync(outputDir)).toEqual([
    "artifacts-manifest.json",
    "keep.txt",
    "playwright.part-00",
    "project.bundle",
  ]);
});

test("publishes the completion manifest last", () => {
  const root = mkdtempSync(join(tmpdir(), "print-pdf-publish-test-"));
  tempRoots.push(root);
  const outputDir = join(root, "output");
  const staging = join(root, "staging");
  mkdirSync(outputDir);
  mkdirSync(staging);
  writeFileSync(join(staging, "project.bundle"), "new-bundle");
  writeFileSync(join(staging, "artifacts-manifest.json"), "new-manifest");
  const moves: string[] = [];
  publishStagedArtifacts(outputDir, staging, (source, destination) => {
    moves.push(source);
    renameSync(source, destination);
  });

  expect(moves.at(-1)).toBe(join(staging, "artifacts-manifest.json"));
  expect(readFileSync(join(outputDir, "artifacts-manifest.json"), "utf8")).toBe(
    "new-manifest",
  );
  expect(readdirSync(outputDir)).toEqual([
    "artifacts-manifest.json",
    "project.bundle",
  ]);
});
