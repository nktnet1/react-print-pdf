import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  ensurePreviewImage,
  isNonEmptyFile,
  previewContentHash,
  rasterizeFirstPage,
} from "../../docgen/previewAssets";

const folders: string[] = [];
const makeFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), "react-print-pdf-preview-"));
  folders.push(folder);
  return folder;
};

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("an interrupted preview build with no PDF fails explicitly", () => {
  const folder = makeFolder();
  expect(() => ensurePreviewImage(folder)).toThrow(/missing or empty PDF/);

  writeFileSync(join(folder, "document.pdf"), "");
  expect(() => ensurePreviewImage(folder)).toThrow(/missing or empty PDF/);
});

test("existing pdf2pic previews are reused without re-rasterizing", () => {
  const folder = makeFolder();
  writeFileSync(join(folder, "document.pdf"), "%PDF-1.4");
  const existing = join(folder, "document.1.jpg");
  writeFileSync(existing, "jpeg data");

  expect(
    ensurePreviewImage(folder, () => {
      throw new Error("rasterizer must not run");
    }),
  ).toBe(existing);
});

test("missing JPEGs are regenerated using the cached PDF", () => {
  const folder = makeFolder();
  const pdf = join(folder, "document.pdf");
  writeFileSync(pdf, "%PDF-1.4");
  const calls: Array<[string, string]> = [];

  const image = ensurePreviewImage(folder, (input, prefix) => {
    calls.push([input, prefix]);
    writeFileSync(`${prefix}.jpg`, "jpeg data");
  });

  expect(calls).toEqual([[pdf, join(folder, "document")]]);
  expect(image).toBe(join(folder, "document.jpg"));
  expect(isNonEmptyFile(image)).toBe(true);
  expect(ensurePreviewImage(folder, () => {})).toBe(image);
});

test("rasterization failures preserve their cause and can be retried", () => {
  const folder = makeFolder();
  writeFileSync(join(folder, "document.pdf"), "%PDF-1.4");
  const cause = new Error("pdftoppm not found");

  try {
    ensurePreviewImage(folder, () => {
      throw cause;
    });
    throw new Error("Expected rasterization to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Poppler (pdftoppm)");
    expect((error as Error).cause).toBe(cause);
  }

  expect(
    ensurePreviewImage(folder, (_input, prefix) => {
      writeFileSync(`${prefix}.jpg`, "recovered JPEG");
    }),
  ).toBe(join(folder, "document.jpg"));
});

test("a successful converter with no image fails clearly", () => {
  const folder = makeFolder();
  writeFileSync(join(folder, "document.pdf"), "%PDF-1.4");
  expect(() => ensurePreviewImage(folder, () => {})).toThrow(
    /without creating a JPEG preview/,
  );
});

test("rasterization captures harmless Poppler warnings without printing them", () => {
  rasterizeFirstPage("example.pdf", "preview", (command, args, options) => {
    expect(command).toBe("pdftoppm");
    expect(args).toContain("-singlefile");
    expect(args.slice(-2)).toEqual(["example.pdf", "preview"]);
    expect(options).toEqual({
      timeout: 120_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return Buffer.from("Syntax Warning: Bad bounding box in Type 3 glyph");
  });
});

test("rasterization reports genuine Poppler failures with stderr details", () => {
  const underlying = Object.assign(new Error("Command failed"), {
    stderr: Buffer.from("Couldn't read damaged PDF"),
  });

  try {
    rasterizeFirstPage("damaged.pdf", "preview", () => {
      throw underlying;
    });
    throw new Error("Expected rasterization failure");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Couldn't read damaged PDF");
    expect((error as Error).cause).toBe(underlying);
  }
});

test("the pre-commit hook does not generate documentation previews", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  ) as { "pre-commit": string[]; scripts: Record<string, string> };

  expect(manifest["pre-commit"]).toEqual(["check"]);
  expect(manifest.scripts["build-components-commit"]).toBeTruthy();
});

test("identical Tailwind documents have stable preview cache keys", async () => {
  const { compile, Tailwind } = await import("react-print-pdf");
  const document = (
    <Tailwind
      preflight={false}
      stylesheet="@theme { --color-example: #123456; }"
    >
      <main className="bg-example">Identical document</main>
    </Tailwind>
  );
  const first = await compile(document);
  const second = await compile(document);
  expect(first).not.toBe(second); // CSS boundaries must remain globally unique.
  expect(previewContentHash(first)).toBe(previewContentHash(second));
}, 15_000);

test("preview cache keys change with content, but not isolated CSS identifiers", async () => {
  const { compile, Tailwind } = await import("react-print-pdf");
  const makeDocument = (color: string) =>
    compile(
      <Tailwind
        preflight={false}
        stylesheet={`@theme { --color-accent: ${color}; --animate-pop: pop 1s; }
          @keyframes pop { to { opacity: .5 } }
          @font-face { font-family: Sample; src: url(sample.woff2); }`}
      >
        <p className="bg-accent animate-pop">Preview</p>
      </Tailwind>,
    );
  const first = await makeDocument("#112233");
  const repeated = await makeDocument("#112233");
  const changed = await makeDocument("#445566");

  expect(previewContentHash(first)).toBe(previewContentHash(repeated));
  expect(previewContentHash(first)).not.toBe(previewContentHash(changed));
}, 15_000);

test("preview cache normalization distinguishes similarly prefixed scope numbers", () => {
  const markup = (nonce: string) =>
    [0, 1, 10]
      .map((index) => {
        const id = `react-print-tailwind-${nonce}-${index}`;
        const encodedId = Buffer.from(id).toString("hex");
        return `<style>@keyframes react-print-${encodedId}-pop { to { opacity: 1 } }</style>
        <template data-react-print-tailwind-start="${id}"></template>
        <div class="animate-pop">${index}</div>
        <template data-react-print-tailwind-end="${id}"></template>`;
      })
      .join("");

  expect(previewContentHash(markup("a".repeat(32)))).toBe(
    previewContentHash(markup("b".repeat(32))),
  );
});
