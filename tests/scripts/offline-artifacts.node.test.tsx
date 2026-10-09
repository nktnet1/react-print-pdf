import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
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
