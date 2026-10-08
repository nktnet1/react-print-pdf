import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { withBasePath } from "#/lib/basePath";
import { gitConfig } from "#/lib/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <img
            src={withBasePath("/logo/icon.svg")}
            className="h-8 w-8 rounded-full"
            loading="eager"
            alt="React Print PDF"
          />
          React Print PDF
        </>
      ),
    },
    links: [],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
