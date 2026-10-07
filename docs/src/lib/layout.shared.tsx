import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { withBasePath } from "./basePath";
import { gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img
            src={withBasePath("/logo/react-print-trim.png")}
            className="h-8 w-8 rounded-md"
            loading="eager"
            alt="React Print"
          />
          React Print
        </>
      ),
    },
    links: [
      {
        text: "Onedoc",
        url: "https://www.onedoclabs.com/",
        secondary: false,
      },
      {
        text: "Discord",
        url: "https://discord.gg/uRJE6e2rgr",
        secondary: false,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
