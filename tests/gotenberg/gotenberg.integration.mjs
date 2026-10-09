import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { styleText } from "node:util";
import { createElement, Fragment } from "react";
import {
  compileWithGotenberg,
  convertHtmlWithGotenberg,
  Margins,
  PageBreak,
} from "../../dist/index.js";

const DEFAULT_IMAGE = "gotenberg/gotenberg:8.37.0-chromium";
const STARTUP_TIMEOUT_MS = 90_000;

// A 24x24 PNG; an actual bitmap lets pdfimages verify that the uploaded asset
// was rendered, rather than merely checking the HTML's src attribute.
const fixturePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAIAAABvFaqvAAAAOklEQVR42mO8I+nIgAqc4mejiexbmEpQDRMDlcCoQYQBo1zFHTLiCFPNaGDTM9ZG89poXhsNbLoYBABXZhd92PeziAAAAABJRU5ErkJggg==",
  "base64",
);

const docker = (args, timeout = 15_000) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  }).trim();

const getContainerState = (id) =>
  JSON.parse(docker(["inspect", "--format", "{{json .State}}", id]));

const describeContainerState = (state) => {
  const details = [state.Status];
  if (state.Status === "exited" || state.Status === "dead") {
    details.push(`exit code ${state.ExitCode}`);
  }
  if (state.Error) details.push(state.Error);
  return details.join(", ");
};

const assertContainerRunning = (id) => {
  const state = getContainerState(id);
  if (state.Status === "exited" || state.Status === "dead") {
    throw new Error(
      `Gotenberg container stopped before becoming healthy (${describeContainerState(state)})`,
    );
  }
};

const printContainerLogs = (id) => {
  try {
    const state = getContainerState(id);
    console.error(
      `Gotenberg container: ${styleText("yellow", state.Status)}${state.Status === "exited" || state.Status === "dead" ? ` (exit code ${styleText("yellow", String(state.ExitCode))})` : ""}${state.Error ? `: ${state.Error}` : ""}`,
    );
  } catch (error) {
    console.error(`Could not inspect Gotenberg container: ${error.message}`);
  }

  const logs = spawnSync("docker", ["logs", "--tail", "60", id], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const output = [logs.stdout, logs.stderr].filter(Boolean).join("\n");
  if (output) console.error(`Gotenberg logs:\n${output}`);
};

const startGotenberg = () => {
  const image = process.env.GOTENBERG_IMAGE || DEFAULT_IMAGE;
  const name = `react-print-pdf-gotenberg-${randomUUID()}`;
  console.log(
    `${styleText("cyan", "Starting")} isolated ${styleText("bold", image)} container`,
  );

  // Let Docker select a free host port while binding it only to loopback.
  // Do not use --rm: an early exit must remain inspectable until logs are read.
  let id;
  try {
    id = docker(
      [
        "run",
        "--detach",
        "--name",
        name,
        "--publish",
        "127.0.0.1::3000",
        image,
      ],
      240_000,
    );
    assertContainerRunning(id);

    const portMapping = docker(["port", id, "3000/tcp"]);
    const port = portMapping.match(/127\.0\.0\.1:(\d+)/)?.[1];
    if (!port) {
      throw new Error(
        `Unexpected Gotenberg Docker port mapping: ${portMapping}`,
      );
    }
    return { id, baseUrl: `http://127.0.0.1:${port}` };
  } catch (error) {
    if (id) {
      printContainerLogs(id);
      try {
        docker(["rm", "--force", id]);
      } catch (cleanupError) {
        console.error(
          "Failed to remove test Gotenberg container:",
          cleanupError,
        );
      }
    }
    throw new Error(`Could not start Gotenberg (${image}): ${error.message}`, {
      cause: error,
    });
  }
};

const waitForHealthy = async (baseUrl, containerId) => {
  const healthUrl = new URL("/health", baseUrl);
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastFailure;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) return;
      lastFailure = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastFailure = error;
    }
    if (containerId) assertContainerRunning(containerId);
    await sleep(1_000);
  }

  throw new Error(
    `Gotenberg was not healthy within ${STARTUP_TIMEOUT_MS / 1_000}s at ${baseUrl}`,
    { cause: lastFailure },
  );
};

const inspectPdf = (bytes) => {
  const pdf = Buffer.from(bytes);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdf.subarray(-256).toString("latin1"), /%%EOF/);

  const directory = mkdtempSync(join(tmpdir(), "react-print-pdf-gotenberg-"));
  const filename = join(directory, "document.pdf");

  try {
    writeFileSync(filename, pdf);
    const inspect = (command, args) =>
      execFileSync(command, args, {
        encoding: "utf8",
        timeout: 15_000,
      });

    return {
      info: inspect("pdfinfo", [filename]),
      text: inspect("pdftotext", ["-layout", filename, "-"]),
      images: inspect("pdfimages", ["-list", filename]),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const verifyReactCompilation = async (baseUrl) => {
  console.log(
    `${styleText("cyan", "Verifying")} compiled React, pagination, and uploaded PNG`,
  );
  const document = createElement(
    Fragment,
    null,
    createElement(Margins, {
      pageRatio: "A5",
      top: "32",
      right: "24",
      bottom: "32",
      left: "24",
    }),
    createElement("h1", null, "Gotenberg invoice page one"),
    createElement("p", null, "Invoice reference GOT-123"),
    createElement("img", {
      src: "fixture.png",
      alt: "Checkerboard fixture",
      width: 72,
      height: 72,
    }),
    createElement(PageBreak),
    createElement("h2", null, "Gotenberg invoice page two"),
    createElement("p", null, "Balance due 42 dollars"),
  );

  const bytes = await compileWithGotenberg(document, {
    baseUrl,
    assets: [
      {
        name: "fixture.png",
        blob: new Blob([fixturePng], { type: "image/png" }),
      },
    ],
  });
  const { info, text, images } = inspectPdf(bytes);

  assert.match(info, /^Pages:\s*2$/m);
  assert.match(info, /^Page size:.*\bA5\b/im);
  assert.match(text, /Gotenberg invoice page one/);
  assert.match(text, /Invoice reference GOT-123/);
  assert.match(text, /Gotenberg invoice page two/);
  assert.match(text, /Balance due 42 dollars/);
  assert.match(images, /^\s*\d+\s+\d+\s+image\b/m);
};

const verifyHtmlConversion = async (baseUrl) => {
  console.log(
    `${styleText("cyan", "Verifying")} complete HTML and overridden Gotenberg form options`,
  );
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>@page { size: letter landscape; margin: 24px; }</style></head>
    <body><h1>Complete HTML document</h1>
    <p>HTML-to-PDF conversion is working</p></body></html>`;

  const bytes = await convertHtmlWithGotenberg(html, {
    baseUrl,
    formFields: { generateDocumentOutline: false },
  });
  const { info, text } = inspectPdf(bytes);

  assert.match(info, /^Pages:\s*1$/m);
  assert.match(info, /^Page size:\s*792(?:\.\d+)? x 612(?:\.\d+)? pts/im);
  assert.match(text, /Complete HTML document/);
  assert.match(text, /HTML-to-PDF conversion is working/);
};

const main = async () => {
  let ownedContainer;
  const stopOwnedContainer = () => {
    if (!ownedContainer) return;
    try {
      docker(["rm", "--force", ownedContainer.id]);
    } catch (error) {
      console.error("Failed to stop test Gotenberg container:", error);
    }
    ownedContainer = undefined;
  };
  const interrupt = (code) => {
    stopOwnedContainer();
    process.exit(code);
  };
  const onSigint = () => interrupt(130);
  const onSigterm = () => interrupt(143);
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    if (!process.env.GOTENBERG_BASE_URL) {
      ownedContainer = startGotenberg();
    }
    const baseUrl = process.env.GOTENBERG_BASE_URL || ownedContainer.baseUrl;
    console.log(
      `${styleText("cyan", "Waiting")} for the Gotenberg health check`,
    );
    await waitForHealthy(baseUrl, ownedContainer?.id);
    await verifyReactCompilation(baseUrl);
    await verifyHtmlConversion(baseUrl);
    console.log(
      `Real Gotenberg PDF integration ${styleText("green", "passed")}`,
    );
  } catch (error) {
    if (ownedContainer) printContainerLogs(ownedContainer.id);
    throw error;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    stopOwnedContainer();
  }
};

await main();
