import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";
import { chromium } from "playwright";
import { build, preview } from "vite";

// Build a production Vite consumer using only the Verdaccio-installed package.
// No workspace aliases, source imports, or repository Vite config are involved.
const root = fileURLToPath(new URL("./vite/", import.meta.url));

await build({
  configFile: false,
  root,
  logLevel: "warn",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The distributed PDF/CSS compiler is already a large module. This
    // compatibility smoke test is not a bundle-size benchmark, but still
    // warns about unexpectedly large (>2 MB) application chunks.
    chunkSizeWarningLimit: 2_000,
  },
});

let server;
let browser;
try {
  server = await preview({
    configFile: false,
    root,
    logLevel: "warn",
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });

  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string", "Vite preview port");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto(`http://127.0.0.1:${address.port}/`);
  assert.equal(response?.status(), 200, "Vite preview response");

  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.consumerStatus !== undefined,
      undefined,
      { timeout: 60_000 },
    );
  } catch (error) {
    throw new Error(
      `Vite consumer did not finish: ${pageErrors.join("; ") || String(error)}`,
      { cause: error },
    );
  }

  const state = await page.evaluate(() => ({
    status: document.documentElement.dataset.consumerStatus,
    error: document.documentElement.dataset.consumerError,
  }));
  assert.equal(state.status, "ready", state.error ?? pageErrors.join("; "));

  const result = await page.evaluate(() => {
    const tailwind = document.querySelector("#tailwind-example");
    const emotion = document.querySelector("#emotion-example");
    if (!tailwind || !emotion) {
      throw new Error("Vite consumer did not render both test elements");
    }

    const tailwindStyle = getComputedStyle(tailwind);
    const emotionStyle = getComputedStyle(emotion);
    return {
      tailwindText: tailwind.textContent,
      tailwindBackground: tailwindStyle.backgroundColor,
      tailwindPadding: tailwindStyle.paddingTop,
      emotionText: emotion.textContent,
      emotionColor: emotionStyle.color,
      emotionPadding: emotionStyle.paddingInlineStart,
      styleCount: document.querySelectorAll("#app style").length,
      html: document.querySelector("#app")?.innerHTML ?? "",
    };
  });

  assert.equal(result.tailwindText, "Installed Vite Tailwind");
  assert.equal(result.tailwindBackground, "rgb(54, 90, 135)");
  assert.equal(result.tailwindPadding, "16px");
  assert.equal(result.emotionText, "Installed Vite Emotion");
  assert.equal(result.emotionColor, "rgb(35, 69, 103)");
  assert.equal(result.emotionPadding, "9px");
  assert.ok(result.styleCount > 0, "Compiled CSS must be injected");
  const start = result.html.match(
    /<template data-react-print-tailwind-start="([^"]+)"><\/template>/,
  );
  const end = result.html.match(
    /<template data-react-print-tailwind-end="([^"]+)"><\/template>/,
  );
  assert.ok(start, "Vite consumer must retain the Tailwind start marker");
  assert.equal(end?.[1], start[1], "Tailwind scope markers must match");
  assert.match(result.html, /@scope\s*\(/);
  assert.doesNotMatch(result.html, /<style\b[^>]*\bdata-emotion=/i);
  assert.deepEqual(pageErrors, [], "No browser JavaScript errors");
  console.log(
    `Verdaccio-installed /client Vite/Chromium smoke test ${styleText("green", "passed")}`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
  }
}
