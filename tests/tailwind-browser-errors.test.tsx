import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Tailwind } from "react-print-pdf";
import { expect, test, vi } from "vitest";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <p data-tailwind-error>{this.state.error.message}</p>
    ) : (
      this.props.children
    );
  }
}

test("direct Tailwind rendering reports CSS compilation failures to an error boundary", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const reactErrorLog = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    root.render(
      <ErrorBoundary>
        <Tailwind stylesheet='@import "./missing-print-style.css";'>
          <p className="font-bold">Will fail</p>
        </Tailwind>
      </ErrorBoundary>,
    );

    await vi.waitFor(
      () => {
        expect(
          host.querySelector("[data-tailwind-error]")?.textContent,
        ).toMatch(/Unsupported Tailwind stylesheet import/);
      },
      { timeout: 15_000 },
    );
  } finally {
    root.unmount();
    host.remove();
    reactErrorLog.mockRestore();
  }
}, 30_000);
