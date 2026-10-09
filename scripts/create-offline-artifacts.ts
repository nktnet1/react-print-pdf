import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, styleText } from "node:util";

const DEFAULT_PART_SIZE_MIB = 400;
const MIB = 1024 * 1024;
const BUNDLE_NAME = "project.bundle";
const DEPENDENCIES_NAME = "node_modules-linux-x64.tar.zst";
const MANIFEST_NAME = "artifacts-manifest.json";
const PART_PATTERN = /^playwright\.part-\d{2,}$/;

export type OfflineArtifactOptions = {
  repoRoot: string;
  outputDir: string;
  playwrightCache: string;
  partSizeMiB?: number;
  allowDirty?: boolean;
};

type Artifact = { file: string; bytes: number; sha256: string };

export type OfflineArtifactManifest = {
  formatVersion: 1;
  commit: string;
  dirtyWorktree: boolean;
  platform: "linux-x64";
  nodeVersion: string;
  playwrightVersion: string;
  chromiumRevision: string;
  partSizeMiB: number;
  artifacts: {
    bundle: Artifact;
    dependencies: Artifact;
    playwrightArchive: Artifact;
    playwrightParts: Artifact[];
  };
};

const HELP = `Create offline ChatGPT Project test artifacts (Linux x64 only).

Usage: node scripts/create-offline-artifacts.ts [options]

Options:
  --repo PATH              Repository root (default: current directory)
  --out PATH               Output directory (default: .tmp/offline-artifacts
                           inside the repository)
  --playwright-cache PATH  Browser cache (default: PLAYWRIGHT_BROWSERS_PATH
                           or ~/.cache/ms-playwright)
  --part-size-mib NUMBER   Max size of each Playwright part (default: 400)
  --allow-dirty            Bundle committed history despite local edits
  --help                   Show this message

The Git bundle contains committed refs only; it cannot include uncommitted edits.
Requires git, GNU tar, zstd, split, node_modules, and Playwright Chromium.
No dependency installation, registry access, Docker, or Bun is needed.`;

export function parseOfflineArtifactArgs(
  args: string[],
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): OfflineArtifactOptions | null {
  const { values } = parseArgs({
    args,
    options: {
      repo: { type: "string" },
      out: { type: "string" },
      "playwright-cache": { type: "string" },
      "part-size-mib": { type: "string" },
      "allow-dirty": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (values.help) return null;

  const repoRoot = resolve(cwd, values.repo ?? ".");
  const partSizeMiB = Number(values["part-size-mib"] ?? DEFAULT_PART_SIZE_MIB);
  if (!Number.isSafeInteger(partSizeMiB) || partSizeMiB < 1) {
    throw new Error("--part-size-mib must be a positive integer");
  }

  const cachePath =
    values["playwright-cache"] ??
    env.PLAYWRIGHT_BROWSERS_PATH ??
    join(homedir(), ".cache", "ms-playwright");
  if (cachePath === "0") {
    throw new Error(
      "PLAYWRIGHT_BROWSERS_PATH=0 is package-local; pass --playwright-cache with the absolute browser cache directory",
    );
  }

  return {
    repoRoot,
    outputDir: resolve(repoRoot, values.out ?? ".tmp/offline-artifacts"),
    playwrightCache: resolve(repoRoot, cachePath),
    partSizeMiB,
    allowDirty: values["allow-dirty"],
  };
}

async function run(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return await new Promise<string>((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8192);
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolveRun(stdout.trim());
      } else {
        rejectRun(
          new Error(
            `${command} ${args[0] ?? ""} failed (${signal ?? code}): ${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
  });
}

function getPlaywrightInstall(repoRoot: string): {
  version: string;
  browserDirs: string[];
  chromiumRevision: string;
} {
  const requireFromProject = createRequire(join(repoRoot, "package.json"));
  let playwrightPackage: string;
  let corePackage: string;
  try {
    playwrightPackage = requireFromProject.resolve("playwright/package.json");
    corePackage = createRequire(playwrightPackage).resolve(
      "playwright-core/package.json",
    );
  } catch {
    throw new Error(
      "Installed Playwright and playwright-core are required in node_modules",
    );
  }

  const version = (
    JSON.parse(readFileSync(playwrightPackage, "utf8")) as {
      version: string;
    }
  ).version;
  const { browsers } = JSON.parse(
    readFileSync(join(dirname(corePackage), "browsers.json"), "utf8"),
  ) as { browsers: Array<{ name: string; revision: string }> };
  const find = (name: string): string => {
    const browser = browsers.find((item) => item.name === name);
    if (!browser?.revision) {
      throw new Error(`Playwright does not declare ${name} in browsers.json`);
    }
    return browser.revision;
  };
  const chromiumRevision = find("chromium");
  return {
    version,
    chromiumRevision,
    browserDirs: [
      `chromium-${chromiumRevision}`,
      `chromium_headless_shell-${find("chromium-headless-shell")}`,
      `ffmpeg-${find("ffmpeg")}`,
    ],
  };
}

async function digest(path: string): Promise<Artifact> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: hash.digest("hex"),
  };
}

function isWithinDirectory(path: string, directory: string): boolean {
  const nested = relative(directory, path);
  return (
    nested === "" ||
    (nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested))
  );
}

/** Resolve symlinks even when the destination itself has not been created. */
function physicalPath(path: string): string {
  const pending: string[] = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    pending.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...pending);
}

function isManagedArtifact(name: string): boolean {
  return (
    name === BUNDLE_NAME ||
    name === DEPENDENCIES_NAME ||
    name === MANIFEST_NAME ||
    PART_PATTERN.test(name)
  );
}

/** @internal: Publish an export, retaining the old files if any move fails. */
export function publishStagedArtifacts(
  outputDir: string,
  staging: string,
  moveFile: (source: string, destination: string) => void = renameSync,
): void {
  // Validate every existing managed file before touching any previous export.
  const existing = readdirSync(outputDir).filter(isManagedArtifact);
  for (const name of existing) {
    const target = join(outputDir, name);
    if (!lstatSync(target).isFile()) {
      throw new Error(`Refusing to replace non-file artifact ${target}`);
    }
  }

  // Keep the old files available for rollback if a rename fails. Publish the
  // manifest last so readers never mistake a partial export for a complete one.
  const backup = mkdtempSync(join(outputDir, ".offline-artifacts-backup-"));
  const backedUp: string[] = [];
  const published: string[] = [];
  let keepBackup = false;
  try {
    for (const name of existing) {
      moveFile(join(outputDir, name), join(backup, name));
      backedUp.push(name);
    }
    const stagedFiles = readdirSync(staging).sort((a, b) =>
      a === MANIFEST_NAME ? 1 : b === MANIFEST_NAME ? -1 : a.localeCompare(b),
    );
    for (const name of stagedFiles) {
      moveFile(join(staging, name), join(outputDir, name));
      published.push(name);
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const name of published.reverse()) {
      try {
        rmSync(join(outputDir, name));
      } catch (failure) {
        rollbackErrors.push(failure);
      }
    }
    for (const name of backedUp) {
      try {
        moveFile(join(backup, name), join(outputDir, name));
      } catch (failure) {
        rollbackErrors.push(failure);
      }
    }
    if (rollbackErrors.length) {
      keepBackup = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Could not fully restore previous artifacts; backup retained at ${backup}`,
      );
    }
    throw error;
  } finally {
    if (!keepBackup) rmSync(backup, { recursive: true, force: true });
  }
}

export async function createOfflineArtifacts(
  options: OfflineArtifactOptions,
): Promise<OfflineArtifactManifest> {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error("Offline artifacts must be created on Linux x64");
  }
  const repoRoot = resolve(options.repoRoot);
  const outputDir = resolve(options.outputDir);
  const playwrightCache = resolve(options.playwrightCache);
  const physicalOutputDir = physicalPath(outputDir);
  if (
    isWithinDirectory(
      physicalOutputDir,
      physicalPath(join(repoRoot, "node_modules")),
    ) ||
    isWithinDirectory(physicalOutputDir, physicalPath(playwrightCache))
  ) {
    throw new Error(
      "Output directory cannot be inside node_modules or the Playwright browser cache",
    );
  }
  const partSizeMiB = options.partSizeMiB ?? DEFAULT_PART_SIZE_MIB;
  if (!Number.isSafeInteger(partSizeMiB) || partSizeMiB < 1) {
    throw new Error("partSizeMiB must be a positive integer");
  }
  if (!existsSync(join(repoRoot, "package.json"))) {
    throw new Error(`Missing package.json in ${repoRoot}`);
  }
  const modules = join(repoRoot, "node_modules");
  if (
    !existsSync(modules) ||
    !statSync(modules).isDirectory() ||
    lstatSync(modules).isSymbolicLink()
  ) {
    throw new Error(
      "node_modules must be a real directory in the repository root",
    );
  }

  const commit = await run("git", ["rev-parse", "--verify", "HEAD"], repoRoot);
  const dirty =
    (await run(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=normal"],
      repoRoot,
    )) !== "";
  if (dirty && !options.allowDirty) {
    throw new Error(
      "Working tree has uncommitted changes; commit first or pass --allow-dirty (the bundle excludes those changes)",
    );
  }
  if (dirty) {
    console.warn(
      `${styleText("yellow", "Warning")}: uncommitted edits are not included in project.bundle`,
    );
  }

  const playwright = getPlaywrightInstall(repoRoot);
  for (const name of playwright.browserDirs) {
    if (
      !existsSync(join(playwrightCache, name)) ||
      !statSync(join(playwrightCache, name)).isDirectory()
    ) {
      throw new Error(
        `Missing Playwright browser directory ${join(playwrightCache, name)}. Install the matching Chromium build first.`,
      );
    }
  }

  // Stage everything before replacing an older export, so failures do not
  // leave incomplete archives or a mixture of old and new browser parts.
  mkdirSync(outputDir, { recursive: true });
  const staging = mkdtempSync(join(outputDir, ".offline-artifacts-"));
  try {
    const bundlePath = join(staging, BUNDLE_NAME);
    await run("git", ["bundle", "create", bundlePath, "--all"], repoRoot);
    await run("git", ["bundle", "verify", bundlePath], repoRoot);

    const dependenciesPath = join(staging, DEPENDENCIES_NAME);
    await run(
      "tar",
      [
        "-I",
        "zstd -T2 -6",
        "-cf",
        dependenciesPath,
        "-C",
        repoRoot,
        "node_modules",
      ],
      repoRoot,
    );

    const playwrightArchive = join(staging, "playwright-linux-x64.tar.zst");
    await run(
      "tar",
      [
        "-I",
        "zstd -T2 -6",
        "-cf",
        playwrightArchive,
        "-C",
        playwrightCache,
        ...playwright.browserDirs,
      ],
      repoRoot,
    );
    const playwrightArchiveDigest = await digest(playwrightArchive);
    const estimatedParts = Math.max(
      1,
      Math.ceil(playwrightArchiveDigest.bytes / (partSizeMiB * MIB)),
    );
    const suffixLength = Math.max(2, String(estimatedParts - 1).length);
    await run(
      "split",
      [
        "-b",
        String(partSizeMiB * MIB),
        "-d",
        "-a",
        String(suffixLength),
        playwrightArchive,
        join(staging, "playwright.part-"),
      ],
      repoRoot,
    );
    rmSync(playwrightArchive);

    const parts = readdirSync(staging)
      .filter((name) => PART_PATTERN.test(name))
      .sort();
    if (parts.length === 0)
      throw new Error("Browser archive produced no parts");

    const manifest: OfflineArtifactManifest = {
      formatVersion: 1,
      commit,
      dirtyWorktree: dirty,
      platform: "linux-x64",
      nodeVersion: process.version,
      playwrightVersion: playwright.version,
      chromiumRevision: playwright.chromiumRevision,
      partSizeMiB,
      artifacts: {
        bundle: await digest(bundlePath),
        dependencies: await digest(dependenciesPath),
        playwrightArchive: playwrightArchiveDigest,
        playwrightParts: await Promise.all(
          parts.map((part) => digest(join(staging, part))),
        ),
      },
    };
    writeFileSync(
      join(staging, MANIFEST_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );

    publishStagedArtifacts(outputDir, staging);
    for (const artifact of [
      manifest.artifacts.bundle,
      manifest.artifacts.dependencies,
      ...manifest.artifacts.playwrightParts,
    ]) {
      console.log(
        `${styleText("green", "Created")} ${join(outputDir, artifact.file)} (${(artifact.bytes / MIB).toFixed(1)} MiB)`,
      );
    }
    console.log(
      `${styleText("green", "Created")} ${join(outputDir, MANIFEST_NAME)} (SHA-256 checksums)`,
    );
    return manifest;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

const mainFile = process.argv[1];
if (mainFile && resolve(mainFile) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOfflineArtifactArgs(process.argv.slice(2));
    if (options === null) console.log(HELP);
    else await createOfflineArtifacts(options);
  } catch (error) {
    console.error(
      `${styleText("red", "Error")}: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
