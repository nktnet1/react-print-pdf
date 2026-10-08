import {
  compileWithGotenberg,
  convertHtmlWithGotenberg,
  GotenbergError,
} from "react-print-pdf";
import { expect, test } from "vitest";

test("compiles React and submits index.html to Gotenberg", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    expect(String(input)).toBe(
      "http://gotenberg:3000/forms/chromium/convert/html",
    );
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Basic dXNlcjpwYXNz");

    const formData = init?.body as FormData;
    const indexHtml = formData.get("files");
    expect(indexHtml).toBeInstanceOf(Blob);
    expect(await (indexHtml as Blob).text()).toContain("Quarterly report");
    expect(await (indexHtml as Blob).text()).toContain("<!doctype html>");
    expect(formData.get("preferCssPageSize")).toBe("true");
    expect(formData.get("printBackground")).toBe("true");
    expect(formData.get("generateDocumentOutline")).toBe("true");

    return new Response("%PDF", { status: 200 });
  };

  const pdf = await compileWithGotenberg(<h1>Quarterly report</h1>, {
    baseUrl: "http://gotenberg:3000/",
    auth: { username: "user", password: "pass" },
    fetch: fetcher,
  });

  expect(pdf).toEqual(new TextEncoder().encode("%PDF"));
});

test("allows Gotenberg form defaults to be overridden", async () => {
  const fetcher: typeof fetch = async (_input, init) => {
    const formData = init?.body as FormData;
    expect(formData.get("generateDocumentOutline")).toBe("false");
    expect(formData.get("waitDelay")).toBe("500ms");
    return new Response("x", { status: 200 });
  };

  await convertHtmlWithGotenberg("<main>Hello</main>", {
    baseUrl: "http://gotenberg:3000",
    formFields: {
      generateDocumentOutline: false,
      waitDelay: "500ms",
    },
    fetch: fetcher,
  });
});

test("includes Gotenberg error details", async () => {
  const fetcher: typeof fetch = async () =>
    new Response("invalid form field", {
      status: 400,
      statusText: "Bad Request",
      headers: { "Gotenberg-Trace": "trace-123" },
    });

  const promise = convertHtmlWithGotenberg("<main>Hello</main>", {
    baseUrl: "http://gotenberg:3000",
    fetch: fetcher,
  });

  await expect(promise).rejects.toBeInstanceOf(GotenbergError);
  await expect(promise).rejects.toMatchObject({
    name: "GotenbergError",
    status: 400,
    statusText: "Bad Request",
    trace: "trace-123",
    responseBody: "invalid form field",
  });
});
