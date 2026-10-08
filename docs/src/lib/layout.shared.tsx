import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { withBasePath } from "#/lib/basePath";
import { gitConfig } from "#/lib/shared";

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
    links: [],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
