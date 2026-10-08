import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";
import { parseReleaseVersion } from "#scripts/release-policy";

const VERDACCIO_VERSION = "6.10.4";
const VITE_VERSION = "8.3.2";
const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
) as {
  name: string;
  version: string;
  dependencies: Record<string, string>;
};
const { distTag } = parseReleaseVersion(manifest.version);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const temporaryRoot = mkdtempSync(join(tmpdir(), "react-print-pdf-verdaccio-"));
const registryRoot = join(temporaryRoot, "registry");
const consumerRoot = join(temporaryRoot, "consumer");
const configPath = join(registryRoot, "config.yaml");
const logPath = join(registryRoot, "verdaccio.log");
const npmrcPath = join(temporaryRoot, ".npmrc");

const run = (
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): void => {
  execFileSync(command, args, { cwd, env, stdio: "inherit", timeout: 300_000 });
};

const reservePort = async (): Promise<number> => {
  const server = createServer();
  return await new Promise<number>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a Verdaccio port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
};

const writeConfig = (): void => {
  mkdirSync(registryRoot, { recursive: true });
  writeFileSync(
    configPath,
    [
      `storage: ${JSON.stringify(join(registryRoot, "storage"))}`,
      "auth:",
      "  htpasswd:",
      `    file: ${JSON.stringify(join(registryRoot, "htpasswd"))}`,
      "    max_users: 10",
      "uplinks:",
      "  npmjs:",
      '    url: "https://registry.npmjs.org/"',
      "packages:",
      `  ${JSON.stringify(manifest.name)}:`,
      '    access: "$all"',
      '    publish: "$authenticated"',
      '  "**":',
      '    access: "$all"',
      '    publish: "$authenticated"',
      '    proxy: "npmjs"',
      "log:",
      '  type: "stdout"',
      '  format: "pretty"',
      '  level: "warn"',
      "",
    ].join("\n"),
  );
};

const waitForRegistry = async (
  registry: string,
  child: ChildProcess,
  getStartupError: () => Error | undefined,
): Promise<void> => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const startupError = getStartupError();
    if (startupError) throw startupError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("Verdaccio stopped before becoming ready");
    }
    try {
      const response = await fetch(`${registry}/-/ping`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Wait until the local registry has started listening.
    }
    await delay(250);
  }
  throw new Error(`Timed out starting Verdaccio at ${registry}`);
};

const createPublisher = async (registry: string): Promise<string> => {
  const username = `smoke-${randomBytes(6).toString("hex")}`;
  const response = await fetch(
    `${registry}/-/user/org.couchdb.user:${encodeURIComponent(username)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: username,
        password: randomBytes(24).toString("base64url"),
        email: `${username}@example.invalid`,
        type: "user",
        roles: [],
      }),
    },
  );
  const body = (await response.json()) as { token?: unknown };
  if (!response.ok || typeof body.token !== "string") {
    throw new Error(`Verdaccio test user creation failed (${response.status})`);
  }
  return body.token;
};

const stopRegistry = async (child: ChildProcess | undefined): Promise<void> => {
  const pid = child?.pid;
  if (!child || pid === undefined) return;

  // pnpm dlx spawns Verdaccio. Terminate its process group on POSIX systems.
  const terminate = (signal: NodeJS.Signals): void => {
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  };

  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit").then(() => true);
    terminate("SIGTERM");
    if (!(await Promise.race([exited, delay(5_000, false)]))) {
      terminate("SIGKILL");
      await exited;
    }
  }
};

const main = async (): Promise<void> => {
  let registryProcess: ChildProcess | undefined;
  let registryLogFd: number | undefined;
  let startupError: Error | undefined;
  try {
    for (const entry of ["index", "client/index", "playwright/index", "mdx"]) {
      for (const extension of ["js", "cjs"]) {
        if (!existsSync(join(root, "dist", `${entry}.${extension}`))) {
          throw new Error(
            `Missing dist/${entry}.${extension}; run pnpm build first`,
          );
        }
      }
    }

    const port = await reservePort();
    const registry = `http://127.0.0.1:${port}`;
    writeConfig();

    console.log(
      `Starting local ${styleText("cyan", "Verdaccio")} ${styleText("dim", VERDACCIO_VERSION)}`,
    );
    registryLogFd = openSync(logPath, "w");
    registryProcess = spawn(
      pnpm,
      [
        "dlx",
        `verdaccio@${VERDACCIO_VERSION}`,
        "--config",
        configPath,
        "--listen",
        `127.0.0.1:${port}`,
      ],
      {
        cwd: root,
        detached: process.platform !== "win32",
        stdio: ["ignore", registryLogFd, registryLogFd],
      },
    );
    registryProcess.on("error", (error) => {
      startupError = error;
    });
    await waitForRegistry(registry, registryProcess, () => startupError);

    const token = await createPublisher(registry);
    writeFileSync(
      npmrcPath,
      `registry=${registry}/\n//127.0.0.1:${port}/:_authToken=${token}\n`,
      { mode: 0o600 },
    );
    const npmEnv = { ...process.env, NPM_CONFIG_USERCONFIG: npmrcPath };

    console.log(
      `Packing and ${styleText("cyan", "publishing")} ${manifest.name}@${styleText("yellow", manifest.version)}`,
    );
    const packed = JSON.parse(
      execFileSync(
        npm,
        [
          "pack",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          temporaryRoot,
        ],
        { cwd: root, env: npmEnv, encoding: "utf8", timeout: 300_000 },
      ),
    ) as { filename: string }[];
    if (packed.length !== 1 || !packed[0]?.filename) {
      throw new Error("npm pack did not produce a single package tarball");
    }
    run(
      npm,
      [
        "publish",
        join(temporaryRoot, packed[0].filename),
        "--registry",
        registry,
        "--tag",
        distTag,
        "--ignore-scripts",
        "--provenance=false",
      ],
      root,
      npmEnv,
    );

    mkdirSync(consumerRoot, { recursive: true });
    writeFileSync(
      join(consumerRoot, "package.json"),
      JSON.stringify({
        name: "verdaccio-consumer",
        private: true,
        version: "0.0.0",
      }),
    );
    console.log(
      `${styleText("cyan", "Installing")} from Verdaccio into an isolated consumer`,
    );
    // The /playwright entrypoint has an optional peer; exercise it explicitly.
    // Use the exact installed version: CI installs Chromium for that version,
    // and newer Playwright versions may expect a different browser revision.
    const playwrightVersion = (
      JSON.parse(
        readFileSync(
          join(root, "node_modules", "playwright", "package.json"),
          "utf8",
        ),
      ) as { version?: string }
    ).version;
    if (!playwrightVersion)
      throw new Error("Missing installed Playwright version");
    // The fixtures import React and Emotion directly, so install them as
    // consumer dependencies rather than relying on npm's hoisting layout.
    const consumerDependencies = ["react", "@emotion/react"].map((name) => {
      const version = manifest.dependencies[name];
      if (!version) throw new Error(`Missing ${name} consumer-test version`);
      return `${name}@${version}`;
    });
    run(
      npm,
      [
        "install",
        `${manifest.name}@${manifest.version}`,
        ...consumerDependencies,
        `playwright@${playwrightVersion}`,
        `vite@${VITE_VERSION}`,
        "--registry",
        registry,
        "--ignore-scripts",
        "--package-lock=false",
        "--no-audit",
        "--no-fund",
      ],
      consumerRoot,
      npmEnv,
    );

    for (const fixture of [
      "assert-compilation.cjs",
      "require.cjs",
      "import.mjs",
    ]) {
      copyFileSync(
        join(root, "tests", "fixtures", "verdaccio-consumer", fixture),
        join(consumerRoot, fixture),
      );
    }
    for (const fixture of ["require.cjs", "import.mjs"]) {
      console.log(
        `${styleText("cyan", "Verifying")} ${styleText("bold", fixture)} against the installed package`,
      );
      run(process.execPath, [fixture], consumerRoot, npmEnv);
    }

    const viteFixtures = join(root, "tests", "fixtures", "verdaccio-consumer");
    mkdirSync(join(consumerRoot, "vite"), { recursive: true });
    for (const fixture of ["index.html", "main.js"]) {
      copyFileSync(
        join(viteFixtures, "vite", fixture),
        join(consumerRoot, "vite", fixture),
      );
    }
    copyFileSync(
      join(viteFixtures, "verify-vite-browser.mjs"),
      join(consumerRoot, "verify-vite-browser.mjs"),
    );
    console.log(
      `${styleText("cyan", "Building")} the installed ${styleText("bold", "/client")} entrypoint with Vite`,
    );
    run(process.execPath, ["verify-vite-browser.mjs"], consumerRoot, npmEnv);
    console.log(
      `Verdaccio CJS/ESM and Vite/Chromium tests ${styleText("green", "passed")}`,
    );
  } catch (error) {
    if (existsSync(logPath)) {
      console.error(
        `${styleText("red", "Verdaccio log:")}\n${readFileSync(logPath, "utf8")}`,
      );
    }
    throw error;
  } finally {
    await stopRegistry(registryProcess);
    if (registryLogFd !== undefined) closeSync(registryLogFd);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

await main();
