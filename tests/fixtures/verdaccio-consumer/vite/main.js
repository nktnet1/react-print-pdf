import { Global, jsx } from "@emotion/react";
import { createElement } from "react";
import { compile, Tailwind } from "react-print-pdf/client";

try {
  const html = await compile(
    createElement(
      Tailwind,
      {
        preflight: false,
        stylesheet: "@theme { --color-consumer-brand: #365a87; }",
      },
      createElement(
        "main",
        null,
        createElement(
          "div",
          { id: "tailwind-example", className: "bg-consumer-brand p-4" },
          "Installed Vite Tailwind",
        ),
        createElement(Global, {
          styles: { ".consumer-global": { color: "#234567" } },
        }),
        jsx(
          "p",
          {
            id: "emotion-example",
            className: "consumer-global",
            css: { paddingInlineStart: "9px" },
          },
          "Installed Vite Emotion",
        ),
      ),
    ),
    { emotion: true },
  );

  document.querySelector("#app").innerHTML = html;
  document.documentElement.dataset.consumerStatus = "ready";
} catch (error) {
  document.documentElement.dataset.consumerError =
    error instanceof Error ? error.stack : String(error);
  document.documentElement.dataset.consumerStatus = "failed";
}
