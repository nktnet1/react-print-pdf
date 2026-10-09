import type React from "react";
import { type CompileOptions, compile } from "#/compile/compile";
import { toHtmlDocument } from "#/html/html-document";

export type GotenbergFormValue = string | number | boolean;

export interface GotenbergBasicAuth {
  username: string;
  password: string;
}

export interface GotenbergAsset {
  /**
   * Flat filename used by the HTML document, for example `logo.png`.
   * Gotenberg stores uploaded assets beside `index.html`.
   */
  name: string;
  blob: Blob;
}

export interface GotenbergRequestOptions {
  /** Base URL of the Gotenberg service, for example `http://localhost:3000`. */
  baseUrl: string;
  /** Optional Gotenberg API basic-auth credentials. */
  auth?: GotenbergBasicAuth;
  /**
   * Additional Chromium form fields accepted by Gotenberg.
   *
   * React Print PDF defaults `preferCssPageSize`, `printBackground`, and
   * `generateDocumentOutline` to `true`. Pass `false` here to disable any of
   * those defaults.
   */
  formFields?: Readonly<Record<string, GotenbergFormValue | undefined>>;
  /** Additional local assets referenced by filename from the generated HTML. */
  assets?: readonly GotenbergAsset[];
  /** Additional HTTP headers sent to the Gotenberg API. */
  headers?: HeadersInit;
  /** Request timeout in milliseconds. Defaults to 60 seconds. */
  timeoutMs?: number;
  /** Optional external abort signal. */
  signal?: AbortSignal;
  /** Override `fetch`, primarily for custom runtimes and tests. */
  fetch?: typeof globalThis.fetch;
}

export interface GotenbergCompileOptions extends GotenbergRequestOptions {
  /** Options forwarded to React Print PDF's `compile()` function. */
  compile?: CompileOptions;
}

export class GotenbergError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly trace?: string;
  readonly responseBody?: string;

  constructor(options: {
    status: number;
    statusText: string;
    trace?: string;
    responseBody?: string;
  }) {
    const detail = options.responseBody ? `: ${options.responseBody}` : "";
    const trace = options.trace ? ` (trace ${options.trace})` : "";
    super(
      `Gotenberg request failed with ${options.status} ${options.statusText}${trace}${detail}`,
    );
    this.name = "GotenbergError";
    this.status = options.status;
    this.statusText = options.statusText;
    this.trace = options.trace;
    this.responseBody = options.responseBody;
  }
}

const DEFAULT_FORM_FIELDS = {
  preferCssPageSize: true,
  printBackground: true,
  generateDocumentOutline: true,
} as const;

const createBasicAuthorization = ({
  username,
  password,
}: GotenbergBasicAuth): string => {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return `Basic ${btoa(binary)}`;
};

const getEndpoint = (baseUrl: string): string => {
  const normalizedBaseUrl = `${baseUrl.replace(/\/+$/, "")}/`;
  return new URL("forms/chromium/convert/html", normalizedBaseUrl).toString();
};

const addAsset = (formData: FormData, asset: GotenbergAsset): void => {
  if (
    !asset.name.trim() ||
    asset.name === "." ||
    asset.name === ".." ||
    asset.name === "index.html" ||
    [...asset.name].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new Error(
      'Gotenberg asset names must be valid filenames and cannot be "index.html".',
    );
  }

  if (asset.name.includes("/") || asset.name.includes("\\")) {
    throw new Error(
      `Gotenberg asset "${asset.name}" must be a flat filename without directories.`,
    );
  }

  formData.append("files", asset.blob, asset.name);
};

const createAbortSignal = (
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } => {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(`Gotenberg request timed out after ${timeoutMs}ms`),
    );
  }, timeoutMs);

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, {
      once: true,
    });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    },
  };
};

/**
 * Convert already-compiled HTML to PDF with a self-hosted Gotenberg instance.
 *
 * This function uses Gotenberg's `/forms/chromium/convert/html` route and
 * returns the response as a `Uint8Array`.
 */
export const convertHtmlWithGotenberg = async (
  html: string,
  options: GotenbergRequestOptions,
): Promise<Uint8Array> => {
  const fetcher = options.fetch ?? globalThis.fetch;

  if (!fetcher) {
    throw new Error(
      "Gotenberg integration requires a runtime with the Fetch API available.",
    );
  }

  const formData = new FormData();
  formData.append(
    "files",
    new Blob([toHtmlDocument(html)], { type: "text/html;charset=utf-8" }),
    "index.html",
  );

  const formFields: Record<string, GotenbergFormValue> = {
    ...DEFAULT_FORM_FIELDS,
  };

  for (const [name, value] of Object.entries(options.formFields ?? {})) {
    if (value !== undefined) {
      formFields[name] = value;
    }
  }

  for (const [name, value] of Object.entries(formFields)) {
    formData.append(name, String(value));
  }

  for (const asset of options.assets ?? []) {
    addAsset(formData, asset);
  }

  const headers = new Headers(options.headers);
  // Let fetch set the multipart boundary for FormData.
  headers.delete("Content-Type");

  if (options.auth) {
    headers.set("Authorization", createBasicAuthorization(options.auth));
  }

  const { signal, cleanup } = createAbortSignal(
    options.timeoutMs ?? 60_000,
    options.signal,
  );

  try {
    const response = await fetcher(getEndpoint(options.baseUrl), {
      method: "POST",
      headers,
      body: formData,
      signal,
    });

    if (!response.ok) {
      const responseBody = (await response.text()).trim();
      throw new GotenbergError({
        status: response.status,
        statusText: response.statusText,
        trace: response.headers.get("Gotenberg-Trace") ?? undefined,
        responseBody: responseBody || undefined,
      });
    }

    return new Uint8Array(await response.arrayBuffer());
  } finally {
    cleanup();
  }
};

/**
 * Compile a React document with React Print PDF and render it as a PDF using a
 * self-hosted Gotenberg instance.
 */
export const compileWithGotenberg = async (
  node: React.ReactElement,
  options: GotenbergCompileOptions,
): Promise<Uint8Array> => {
  const html = await compile(node, options.compile);
  return convertHtmlWithGotenberg(html, options);
};
