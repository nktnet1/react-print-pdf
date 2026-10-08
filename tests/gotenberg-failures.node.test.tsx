import { convertHtmlWithGotenberg, type GotenbergAsset } from "react-print-pdf";
import { expect, test, vi } from "vitest";

const endpoint = "http://gotenberg:3000";

const neverCompletes: typeof fetch = async (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (!signal) {
      reject(new Error("Expected an abort signal"));
      return;
    }

    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
  });

test("includes uploaded assets and respects custom request headers", async () => {
  const logo = new Blob(["logo-content"], { type: "image/png" });
  const fetcher: typeof fetch = async (_input, init) => {
    const body = init?.body;
    expect(body).toBeInstanceOf(FormData);
    const files = (body as FormData).getAll("files") as File[];
    expect(files).toHaveLength(2);
    expect(files[0]?.name).toBe("index.html");
    expect(await files[0]?.text()).toBe(
      "<!doctype html><html><body>Existing document</body></html>",
    );
    expect(files[1]?.name).toBe("logo.png");
    expect(files[1]?.type).toBe("image/png");
    expect(await files[1]?.text()).toBe("logo-content");

    const headers = new Headers(init?.headers);
    expect(headers.get("X-Request-ID")).toBe("report-17");
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from("usér:påss", "utf8").toString("base64")}`,
    );

    return new Response("%PDF-1.7", { status: 200 });
  };

  const pdf = await convertHtmlWithGotenberg(
    "<!doctype html><html><body>Existing document</body></html>",
    {
      baseUrl: endpoint,
      assets: [{ name: "logo.png", blob: logo }],
      headers: {
        "X-Request-ID": "report-17",
        "Content-Type": "application/json",
      },
      auth: { username: "usér", password: "påss" },
      fetch: fetcher,
    },
  );

  expect(new TextDecoder().decode(pdf)).toBe("%PDF-1.7");
});

test.each(["", "index.html", "images/logo.png", "images\\logo.png"])(
  "rejects unsafe or reserved asset filename %j before calling fetch",
  async (name) => {
    const assets: GotenbergAsset[] = [{ name, blob: new Blob(["asset"]) }];
    const fetcher = vi.fn<typeof fetch>(async () => new Response("%PDF"));

    await expect(
      convertHtmlWithGotenberg("<main>Report</main>", {
        baseUrl: endpoint,
        assets,
        fetch: fetcher,
      }),
    ).rejects.toThrow(/Gotenberg asset/);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

test("aborts an outstanding request after the configured timeout", async () => {
  vi.useFakeTimers();
  try {
    let requestSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = (input, init) => {
      requestSignal = init?.signal;
      return neverCompletes(input, init);
    };

    const promise = convertHtmlWithGotenberg("<main>Report</main>", {
      baseUrl: endpoint,
      timeoutMs: 250,
      fetch: fetcher,
    });
    const rejection = expect(promise).rejects.toThrow(
      "Gotenberg request timed out after 250ms",
    );

    await vi.advanceTimersByTimeAsync(250);
    await rejection;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("propagates external cancellation and removes its abort listener", async () => {
  const controller = new AbortController();
  const removed = vi.spyOn(controller.signal, "removeEventListener");

  const promise = convertHtmlWithGotenberg("<main>Report</main>", {
    baseUrl: endpoint,
    signal: controller.signal,
    fetch: neverCompletes,
  });
  const rejection = expect(promise).rejects.toThrow("cancelled by caller");
  controller.abort(new Error("cancelled by caller"));

  await rejection;
  expect(removed).toHaveBeenCalledWith("abort", expect.any(Function));
});

test("honours an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort(new Error("cancelled before request"));

  await expect(
    convertHtmlWithGotenberg("<main>Report</main>", {
      baseUrl: endpoint,
      signal: controller.signal,
      fetch: neverCompletes,
    }),
  ).rejects.toThrow("cancelled before request");
});

test("forwards fetch failures without leaving a timeout scheduled", async () => {
  vi.useFakeTimers();
  try {
    const error = new TypeError("network unavailable");
    const fetcher: typeof fetch = async () => {
      throw error;
    };

    await expect(
      convertHtmlWithGotenberg("<main>Report</main>", {
        baseUrl: endpoint,
        fetch: fetcher,
      }),
    ).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
